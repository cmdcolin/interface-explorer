import gzip
import json
import random
import sys
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
SAMPLE = 150
MAX_COMPLEXES = 15
CONTACT = 5.0
SEED = 0
PATHOGENIC = {"Pathogenic", "Likely pathogenic", "Pathogenic/Likely pathogenic"}
BENIGN = {"Benign", "Likely benign", "Benign/Likely benign"}
UNCERTAIN = {"Variant of uncertain significance"}


def get_json(url, path, params=None):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(6):
            response = requests.get(url, params=params, timeout=120)
            if response.status_code in (400, 404):
                path.write_text("null")
                break
            if response.ok:
                path.write_text(response.text)
                break
            time.sleep(2**attempt)
        if not path.exists():
            response.raise_for_status()
    return json.loads(path.read_text())


def get_file(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(6):
            response = requests.get(url, timeout=300)
            if response.ok:
                path.write_bytes(gzip.compress(response.content))
                break
            time.sleep(2**attempt)
        if not path.exists():
            response.raise_for_status()
    return gzip.decompress(path.read_bytes()).decode()


def sample_proteins():
    rows = get_json(
        "https://rest.uniprot.org/uniprotkb/stream",
        DATA / "disease_proteins.json",
        {"query": "organism_id:9606 AND reviewed:true AND cc_disease:*", "fields": "accession,gene_primary,length", "format": "json"},
    )["results"]
    usable = [(r["primaryAccession"], r.get("genes", [{}])[0].get("geneName", {}).get("value", "")) for r in rows]
    return random.Random(SEED).sample(usable, SAMPLE)


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
    hetero = sorted((c for c in complexes if c.get("assemblyType") == "Hetero"), key=lambda c: -(c.get("complexPredictionAccuracy_ipTM") or 0))
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


def protein_variants(accession):
    data = get_json(f"https://www.ebi.ac.uk/proteins/api/variation/{accession}", DATA / "variants" / f"{accession}.json", {"format": "json"}) or {}
    variants = []
    for feature in data.get("features", []):
        if feature.get("consequenceType") == "missense" and feature.get("begin") == feature.get("end"):
            kinds = {s["type"] for s in feature.get("clinicalSignificances", []) if "ClinVar" in s.get("sources", [])}
            label = "pathogenic" if kinds & PATHOGENIC and not kinds & BENIGN else "benign" if kinds & BENIGN and not kinds & PATHOGENIC else "uncertain" if kinds & UNCERTAIN else None
            if label:
                variants.append({"position": int(feature["begin"]), "label": label, "change": f"{feature.get('wildType')}{feature['begin']}{feature.get('mutatedType')}", "genomic": feature.get("genomicLocation", [])})
    return variants


def process(entry):
    accession, gene = entry
    interfaces = protein_interfaces(accession)
    context = protein_context(accession) if interfaces["hetero"] else {}
    return {"accession": accession, "gene": gene, **interfaces, "context": context, "variants": protein_variants(accession)}


def main(workers=6):
    proteins = sample_proteins()
    with ThreadPoolExecutor(int(workers)) as pool:
        results = []
        for result in pool.map(process, proteins):
            results.append(result)
            print(f"{len(results)}/{len(proteins)} {result['gene']}: {result['hetero']} hetero complexes, {len(result['variants'])} classified missense", flush=True)
    OUT.mkdir(exist_ok=True)
    (OUT / "atlas.json").write_text(json.dumps(results))


if __name__ == "__main__":
    main(*sys.argv[1:2])
