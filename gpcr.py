import csv
import json
import re
import shlex
from pathlib import Path

import numpy as np
from Bio import Align
from Bio.Align import substitution_matrices
from Bio.SeqUtils import seq1
from scipy.spatial import cKDTree

from atlas import CONTACT, DATA, OUT, get_file, get_json
from clinvar import VARIANTS
from tracks import COLOURS, CONFIDENT, MIN_PLDDT, bed12, coding_positions, merge, write_bigbed

ROOT = Path(__file__).resolve().parent
STRUCTURES = ROOT / "gpcr_structures.tsv"
SITE_DATA = ROOT / "site" / "data"
G_ALPHA = re.compile(r"^GNA(S|L|Z|Q|O1|I[1-3]|T[1-3]|1[1-5])$")
G_ALPHA_ENTITY = re.compile(r"(?i)subunit alpha|mini-?G|G protein subunit [sqio]\b")
INTERFACE_COLOUR = "0,140,90"
ALIGNER = Align.PairwiseAligner(mode="global", substitution_matrix=substitution_matrices.load("BLOSUM62"), open_gap_score=-10, extend_gap_score=-0.5)


def structures():
    with STRUCTURES.open() as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def uniprot(accession):
    base = accession.split("-")[0]
    entry = get_json(
        f"https://rest.uniprot.org/uniprotkb/{base}",
        DATA / "uniprot" / f"{base}.json",
        {"fields": "accession,id,gene_primary,organism_id,sequence", "format": "json"},
    )
    fasta = get_file(f"https://rest.uniprot.org/uniprotkb/{accession}.fasta", DATA / "uniprot" / f"{accession}.fasta.gz")
    return {
        "accession": accession,
        "id": entry["uniProtkbId"].lower(),
        "gene": (entry.get("genes") or [{}])[0].get("geneName", {}).get("value", "").upper(),
        "organism": entry["organism"]["taxonId"],
        "sequence": "".join(fasta.splitlines()[1:]),
    }


def human_candidates(gene):
    return get_json(
        "https://rest.uniprot.org/uniprotkb/search",
        DATA / "uniprot" / f"human_{gene}.json",
        {"query": f"gene_exact:{gene} AND organism_id:9606 AND reviewed:true", "fields": "accession,gene_primary,sequence", "format": "json"},
    )["results"]


def residue_map(source, target):
    alignment = ALIGNER.align(source, target)[0]
    pairs = {}
    for (a0, a1), (b0, b1) in zip(*alignment.aligned):
        pairs.update({int(a0) + k + 1: int(b0) + k + 1 for k in range(int(a1 - a0))})
    identity = sum(source[a - 1] == target[b - 1] for a, b in pairs.items()) / len(target)
    return pairs, identity


def human_ortholog(info):
    candidates = [c for c in human_candidates(info["gene"]) if c["sequence"]["value"]]
    scored = [(residue_map(info["sequence"], c["sequence"]["value"]), c) for c in candidates]
    (pairs, identity), best = max(scored, key=lambda item: item[0][1])
    return {"accession": best["primaryAccession"], "gene": info["gene"], "sequence": best["sequence"]["value"], "pairs": pairs, "identity": identity}


def mmcif(pdb):
    return get_file(f"https://www.ebi.ac.uk/pdbe/entry-files/download/{pdb.lower()}_updated.cif", DATA / "pdbe" / f"{pdb.lower()}.cif.gz")


def loop_rows(cif, category, split=str.split):
    header, rows = [], []
    for line in cif.splitlines():
        if line.startswith(f"_{category}."):
            header.append(line.split(".", 1)[1].strip())
        elif header and (line.startswith(("#", "loop_", "_"))):
            if rows:
                break
        elif header:
            rows.append(dict(zip(header, split(line))))
    return rows


def g_alpha_entities(cif):
    return {e["id"] for e in loop_rows(cif, "entity", shlex.split) if G_ALPHA_ENTITY.search(e.get("pdbx_description", ""))}


def atoms(cif):
    return [
        {
            "chain": row["auth_asym_id"],
            "entity": row["label_entity_id"],
            "seq": int(row["label_seq_id"]),
            "comp": row["label_comp_id"],
            "source": (row["pdbx_sifts_xref_db_acc"], int(row["pdbx_sifts_xref_db_num"])) if row["pdbx_sifts_xref_db_name"] == "UNP" and row["pdbx_sifts_xref_db_num"] not in ("?", ".") else None,
            "xyz": (float(row["Cartn_x"]), float(row["Cartn_y"]), float(row["Cartn_z"])),
        }
        for row in loop_rows(cif, "atom_site")
        if row["pdbx_PDB_model_num"] == "1" and row["type_symbol"] != "H" and row["label_seq_id"] not in (".", "?")
    ]


def aligned_sources(chain_atoms, accession):
    residues = dict(sorted({(a["seq"], a["comp"]) for a in chain_atoms}))
    sequence = "".join(seq1(residues[k]) or "X" for k in residues)
    pairs, _ = residue_map(sequence, uniprot(accession)["sequence"])
    by_index = {seq: pairs.get(index) for index, seq in enumerate(residues, start=1)}
    return [{**a, "source": (accession, by_index[a["seq"]]) if by_index[a["seq"]] else None} for a in chain_atoms]


def receptor_accession(entry):
    return get_json(
        "https://rest.uniprot.org/uniprotkb/search",
        DATA / "uniprot" / f"id_{entry}.json",
        {"query": f"id:{entry.upper()}", "fields": "accession", "format": "json"},
    )["results"][0]["primaryAccession"]


def contacts(own, other):
    distances, _ = cKDTree(np.array([a["xyz"] for a in other])).query(np.array([a["xyz"] for a in own]), distance_upper_bound=CONTACT)
    return {a["source"] for a, distance in zip(own, distances) if np.isfinite(distance) and a["source"]}


def to_human(residues, orthologs):
    by_gene = {}
    for accession, number in residues:
        human = orthologs[accession]
        position = human["pairs"].get(number)
        if position:
            by_gene.setdefault(human["accession"], set()).add(position)
    return by_gene


def side(accession, residues, orthologs, variants, partner):
    human = next(o for o in orthologs.values() if o["accession"] == accession)
    mapped = coding_positions(accession, len(human["sequence"]))
    return {
        "gene": human["gene"],
        "accession": accession,
        "identity": round(min(o["identity"] for o in orthologs.values() if o["accession"] == accession), 2),
        "residues": sorted(residues),
        "locus": f"{mapped[0]}:{min(mapped[2])}-{max(mapped[2])}" if mapped else None,
        "variants": [
            {key: v[key] for key in ("change", "label", "position", "variation", "chrom", "pos", "allele")}
            for v in variants.get(accession, [])
            if v["position"] in residues
        ],
        "partner": partner,
    }


def gpcr_accessions():
    return {r["primaryAccession"] for r in get_json(
        "https://rest.uniprot.org/uniprotkb/stream",
        DATA / "uniprot_gpcrs.json",
        {"query": "organism_id:9606 AND reviewed:true AND keyword:KW-0297", "fields": "accession", "format": "json"},
    )["results"]}


def predicted_interfaces(atlas_by_accession, own, partners):
    return [
        (c["partner_gene"] or c["partner"], c["ipsae"], {int(r) for r, plddt in c["residues"].items() if plddt >= MIN_PLDDT})
        for c in sorted(atlas_by_accession.get(own, {}).get("interfaces", []), key=lambda c: -(c["ipsae"] or 0))
        if (c["ipsae"] or 0) >= CONFIDENT and partners(c)
    ]


def agreement(experimental, prediction, partner):
    shared = len(set(experimental) & prediction)
    return {"partner": partner, "predicted": len(prediction), "shared": shared, "recall": round(shared / len(experimental), 2), "precision": round(shared / len(prediction), 2)}


def receptor_agreement(atlas_by_accession, receptor):
    candidates = predicted_interfaces(atlas_by_accession, receptor["accession"], lambda c: G_ALPHA.match(c["partner_gene"] or ""))
    best = next((c for c in candidates if c[0] in receptor["partner"]), candidates[0] if candidates else None)
    return agreement(receptor["residues"], best[2], best[0]) if best and receptor["residues"] and best[2] else None


def g_alpha_summaries(records, atlas_by_accession, variants):
    gpcrs = gpcr_accessions()
    by_g = {}
    for record in records:
        for g in record["gProteins"]:
            entry = by_g.setdefault(g["accession"], {"gene": g["gene"], "accession": g["accession"], "length": len(uniprot(g["accession"])["sequence"]), "locus": g["locus"], "counts": {}, "receptors": []})
            entry["receptors"].append(f"{record['receptorSide']['gene']} ({record['pdb']})")
            for residue in g["residues"]:
                entry["counts"][residue] = entry["counts"].get(residue, 0) + 1
    summaries = []
    for accession, entry in by_g.items():
        experimental = set(entry["counts"])
        predictions = predicted_interfaces(atlas_by_accession, accession, lambda c: c["partner"] in gpcrs)
        predicted = set().union(*(p[2] for p in predictions)) if predictions else set()
        summaries.append({
            **entry,
            "counts": sorted(entry["counts"].items()),
            "structures": len(entry["receptors"]),
            "afdbReceptors": [p[0] for p in predictions],
            "afdb": agreement(experimental, predicted, f"{len(predictions)} GPCRs") if predicted else None,
            "variants": [{key: v[key] for key in ("change", "label", "position", "variation")} for v in variants.get(accession, []) if v["position"] in experimental],
        })
    return sorted(summaries, key=lambda s: -s["structures"])


def complex_record(structure, atlas_by_accession, variants):
    cif = mmcif(structure["pdb"])
    rows = atoms(cif)
    receptor_base = receptor_accession(structure["entry"])
    chain = [a for a in rows if a["chain"] == structure["chain"]]
    own = lambda a: a["source"] and a["source"][0].split("-")[0] == receptor_base
    receptor_atoms = [a if own(a) else {**a, "source": None} for a in chain] if any(own(a) for a in chain) else aligned_sources(chain, receptor_base)
    g_entities = g_alpha_entities(cif)
    g_atoms = [a for a in rows if a["entity"] in g_entities or (a["source"] and G_ALPHA.match(uniprot(a["source"][0])["gene"]))]
    if not (receptor_atoms and g_atoms):
        return None
    g_atoms = [a if a["source"] and G_ALPHA.match(uniprot(a["source"][0])["gene"]) else {**a, "source": None} for a in g_atoms]
    sources = {a["source"][0] for a in receptor_atoms + g_atoms if a["source"]}
    orthologs = {accession: human_ortholog(uniprot(accession)) for accession in sources}
    receptor_sides = to_human(contacts(receptor_atoms, g_atoms), orthologs)
    g_sides = to_human(contacts(g_atoms, receptor_atoms), orthologs)
    receptor_human = next(o["accession"] for a, o in orthologs.items() if a.split("-")[0] == receptor_base)
    g_genes = sorted({orthologs[a]["gene"] for a in sources if G_ALPHA.match(orthologs[a]["gene"])})
    receptor = side(receptor_human, receptor_sides.get(receptor_human, set()), orthologs, variants, g_genes)
    g_proteins = [side(accession, residues, orthologs, variants, receptor["gene"]) for accession, residues in sorted(g_sides.items())]
    receptor["afdb"] = receptor_agreement(atlas_by_accession, receptor)
    return {**{key: structure[key] for key in ("pdb", "method", "resolution", "state", "species", "g_family", "g_subtype", "g_note", "receptor")}, "receptorSide": receptor, "gProteins": g_proteins}


def interface_lines(records):
    features, marks = [], []
    for record in records:
        receptor = record["receptorSide"]
        for own, partner in [(receptor, "+".join(g["gene"] for g in record["gProteins"])), *((g, receptor["gene"]) for g in record["gProteins"])]:
            coordinates = coding_positions_for(own)
            if coordinates and own["residues"]:
                chrom, strand, positions = coordinates
                codons = [positions[3 * (r - 1) + k] - 1 for r in own["residues"] for k in range(3) if 3 * (r - 1) + k < len(positions)]
                features.append(bed12(chrom, strand, merge(codons), f"{own['gene']}–{partner} ({record['pdb']})", 1000, INTERFACE_COLOUR))
                for v in own["variants"]:
                    marks.append(((v["chrom"], v["pos"], own["gene"], v["change"]), v["label"], strand, record["pdb"], partner))
    merged = {}
    for key, label, strand, pdb, partner in marks:
        merged.setdefault(key, (label, strand, set()))[2].add(f"{partner} in {pdb}")
    variant_lines = []
    for (chrom, pos, gene, change), (label, strand, where) in merged.items():
        listed = sorted(where)
        name = f"{gene} {change} {label}; contacts {', '.join(listed[:3])}" + (f" and {len(listed) - 3} more" if len(listed) > 3 else "")
        variant_lines.append(f"chr{chrom}\t{pos - 1}\t{pos}\t{name}\t0\t{strand}\t{pos - 1}\t{pos}\t{COLOURS[label]}")
    return features, variant_lines


def coding_positions_for(own):
    sequence = uniprot(own["accession"])["sequence"]
    return coding_positions(own["accession"], len(sequence))


def main():
    atlas_path = OUT / "atlas.json"
    atlas_by_accession = {p["accession"]: p for p in json.loads(atlas_path.read_text())}
    variants = json.loads(VARIANTS.read_text())
    listed = structures()
    records = [r for r in (complex_record(s, atlas_by_accession, variants) for s in listed if s["g_family"] != "-") if r]
    features, variant_lines = interface_lines(records)
    write_bigbed("gpcr_interfaces", features, "bed12")
    write_bigbed("gpcr_interface_variants", variant_lines, "bed9")
    others = [{key: s[key] for key in ("pdb", "method", "resolution", "state", "species", "receptor", "gene", "degree_active")} for s in listed if s["g_family"] == "-"]
    summaries = g_alpha_summaries(records, atlas_by_accession, variants)
    (SITE_DATA / "gpcr.json").write_text(json.dumps({"complexes": records, "gAlphas": summaries, "others": others}, ensure_ascii=False))
    print(f"{len(records)} receptor–G protein complexes, {len(features)} interface features, {len(variant_lines)} variants on them")


if __name__ == "__main__":
    main()
