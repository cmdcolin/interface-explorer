import gzip
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import io

import numpy as np
import requests
from Bio.PDB import MMCIFParser
from Bio.PDB.SASA import ShrakeRupley
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "out"
MAX_COMPLEXES = 30
CONTACT = 5.0


def write_atomically(path, content):
    partial = path.with_name(f"{path.name}.{threading.get_ident()}.part")
    partial.write_bytes(content)
    partial.replace(path)


def get_json(url, path, params=None, keep=lambda data: data):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(9):
            response = requests.get(url, params=params, timeout=120)
            if response.status_code in (400, 404):
                write_atomically(path, b"null")
                break
            if response.ok:
                write_atomically(path, json.dumps(keep(response.json())).encode())
                break
            time.sleep(2**attempt)
        if not path.exists():
            response.raise_for_status()
    return json.loads(path.read_text())


def get_file(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(9):
            response = requests.get(url, timeout=300)
            if response.ok:
                write_atomically(path, gzip.compress(response.content))
                break
            time.sleep(2**attempt)
        if not path.exists():
            response.raise_for_status()
    return gzip.decompress(path.read_bytes()).decode()


ENTRY_FIELDS = "accession,gene_primary,sequence,cc_alternative_products,ft_var_seq,xref_refseq,xref_mane-select"


def uniprot_entries(query, path):
    return get_json("https://rest.uniprot.org/uniprotkb/stream", path, {"query": query, "fields": ENTRY_FIELDS, "format": "json"})["results"]


def disease_entries():
    return uniprot_entries("organism_id:9606 AND reviewed:true AND cc_disease:*", DATA / "uniprot_disease.json")


def human_entries():
    return uniprot_entries("organism_id:9606 AND reviewed:true", DATA / "uniprot_human.json")


def disease_proteins():
    return [(e["primaryAccession"], e.get("genes", [{}])[0].get("geneName", {}).get("value", ""), e["sequence"]["value"]) for e in disease_entries()]



def atoms_by_chain(cif):
    header, chains = [], {}
    for line in cif.splitlines():
        if line.startswith("_atom_site."):
            header.append(line.split(".", 1)[1].strip())
        elif line.startswith("ATOM") and header:
            fields = line.split()
            row = dict(zip(header, fields))
            if row.get("type_symbol") != "H":
                chains.setdefault(row["auth_asym_id"], []).append(
                    (int(row["label_seq_id"]), float(row["Cartn_x"]), float(row["Cartn_y"]), float(row["Cartn_z"]), float(row["B_iso_or_equiv"]))
                )
    return {chain: np.array(rows) for chain, rows in chains.items()}


def interface_residues(own, partner):
    distances, _ = cKDTree(partner[:, 1:4]).query(own[:, 1:4], distance_upper_bound=CONTACT)
    residues = {}
    for (position, *_, plddt), distance in zip(own, distances):
        if np.isfinite(distance):
            residues[int(position)] = plddt
    return residues


def protein_interfaces(accession):
    complexes = get_json(f"https://alphafold.ebi.ac.uk/api/complex/{accession}", DATA / "complexes" / f"{accession}.json") or []
    hetero = sorted((c for c in complexes if c.get("assemblyType") == "Hetero"), key=lambda c: -(c.get("complexPredictionAccuracy_ipSAE") or 0))
    results = []
    for complex_entry in hetero[:MAX_COMPLEXES]:
        entity = complex_entry["modelEntityId"]
        chains = get_json(f"https://alphafold.ebi.ac.uk/api/prediction/{entity}", DATA / "models" / f"{entity}.json") or []
        own_chain = next((c for c in chains if c.get("uniprotAccession") == accession), None)
        partner = next((c for c in chains if c.get("uniprotAccession") != accession), None)
        if own_chain and partner and own_chain.get("cifUrl"):
            atoms = atoms_by_chain(get_file(own_chain["cifUrl"], DATA / "cif" / f"{entity}.cif.gz"))
            if own_chain["chainId"] in atoms and partner["chainId"] in atoms:
                offset = (own_chain.get("uniprotStart") or 1) - 1
                residues = interface_residues(atoms[own_chain["chainId"]], atoms[partner["chainId"]])
                results.append(
                    {
                        "entity": entity,
                        "partner": partner.get("uniprotAccession"),
                        "partner_gene": partner.get("gene"),
                        "iptm": complex_entry.get("complexPredictionAccuracy_ipTM"),
                        "ipsae": complex_entry.get("complexPredictionAccuracy_ipSAE"),
                        "pdockq": complex_entry.get("complexPredictionAccuracy_pDockQ"),
                        "residues": {position + offset: plddt for position, plddt in residues.items()},
                    }
                )
    return {"complexes": len(complexes), "hetero": len(hetero), "interfaces": results}


MAX_ASA = {
    "ALA": 129, "ARG": 274, "ASN": 195, "ASP": 193, "CYS": 167, "GLN": 225, "GLU": 223, "GLY": 104, "HIS": 224, "ILE": 197,
    "LEU": 201, "LYS": 236, "MET": 224, "PHE": 240, "PRO": 159, "SER": 155, "THR": 172, "TRP": 285, "TYR": 263, "VAL": 174,
}


def protein_context(accession):
    models = get_json(f"https://alphafold.ebi.ac.uk/api/prediction/{accession}", DATA / "monomers" / f"{accession}.json") or []
    whole = [m for m in models if m.get("uniprotAccession") == accession and m.get("cifUrl") and m.get("uniprotStart") == 1 and m.get("uniprotEnd") == len(m.get("sequence", "")) and "-F1-" in m["cifUrl"]]
    context = {}
    if whole:
        cif = get_file(whole[0]["cifUrl"], DATA / "monomer_cif" / f"{accession}.cif.gz")
        model = MMCIFParser(QUIET=True).get_structure(accession, io.StringIO(cif))[0]
        ShrakeRupley().compute(model, level="R")
        for residue in model.get_residues():
            name = residue.get_resname()
            if name in MAX_ASA:
                plddt = next(iter(residue)).get_bfactor()
                context[residue.id[1]] = (round(plddt, 1), round(residue.sasa / MAX_ASA[name], 3))
    return context


def process(entry):
    accession, gene, sequence = entry
    try:
        interfaces = protein_interfaces(accession)
        with_complex = interfaces["hetero"] > 0
        return {
            "accession": accession,
            "gene": gene,
            "length": len(sequence),
            **interfaces,
            "context": protein_context(accession) if with_complex else {},
        }
    except Exception as error:
        return {"accession": accession, "gene": gene, "error": f"{type(error).__name__}: {error}"}


def main(workers=6):
    proteins = disease_proteins()
    with ThreadPoolExecutor(int(workers)) as pool:
        results = []
        for result in pool.map(process, proteins):
            results.append(result)
            if len(results) % 250 == 0:
                print(f"{len(results)}/{len(proteins)}", flush=True)
    failed = [r for r in results if "error" in r]
    done = [r for r in results if "error" not in r]
    OUT.mkdir(exist_ok=True)
    (OUT / "atlas.json").write_text(json.dumps(done))
    print(f"{len(done)} proteins, {sum(r['hetero'] > 0 for r in done)} with a hetero complex; {len(failed)} failed: {[r['accession'] for r in failed][:20]}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
