import json
import re
from pathlib import Path

from atlas import OUT
from tracks import CONFIDENT, MIN_PLDDT, coding_positions

DATA_DIR = Path(__file__).resolve().parent / "site" / "data"
HGVS = re.compile(r"NC_0000(\d\d)\.\d+:g\.(\d+)")


def runs(residues):
    spans = []
    for residue in sorted(residues):
        if spans and residue <= spans[-1][1] + 1:
            spans[-1][1] = residue
        else:
            spans.append([residue, residue])
    return ", ".join(f"{a}" if a == b else f"{a}–{b}" for a, b in spans)


def chromosome(number):
    return {"23": "X", "24": "Y"}.get(number.lstrip("0"), number.lstrip("0"))


def gene_record(protein):
    length = max(int(k) for k in protein["context"])
    chrom, strand, positions = coding_positions(protein["accession"], length)
    partners = []
    at_residue = {}
    for complex_entry in sorted(protein["interfaces"], key=lambda c: -(c["ipsae"] or 0)):
        if (complex_entry["ipsae"] or 0) >= CONFIDENT:
            residues = sorted(int(r) for r, plddt in complex_entry["residues"].items() if plddt >= MIN_PLDDT and int(r) <= length)
            name = complex_entry["partner_gene"] or complex_entry["partner"]
            for residue in residues:
                at_residue.setdefault(residue, []).append(name)
            partners.append(
                {
                    "gene": name,
                    "accession": complex_entry["partner"],
                    "ipsae": complex_entry["ipsae"],
                    "iptm": complex_entry["iptm"],
                    "pdockq": complex_entry["pdockq"],
                    "entity": complex_entry["entity"],
                    "residues": len(residues),
                    "runs": runs(residues),
                }
            )
    variants = []
    for variant in protein["variants"]:
        match = next((HGVS.search(g) for g in variant["genomic"] if HGVS.search(g)), None)
        if variant["position"] in at_residue and match:
            variants.append(
                {
                    "change": variant["change"],
                    "label": variant["label"],
                    "position": variant["position"],
                    "partners": sorted(set(at_residue[variant["position"]])),
                    "clinvar": variant.get("clinvar"),
                    "chrom": chromosome(match.group(1)),
                    "pos": int(match.group(2)),
                }
            )
    for partner in partners:
        partner["variants"] = sum(partner["gene"] in v["partners"] for v in variants)
    counts = {label: sum(v["label"] == label for v in variants) for label in ["pathogenic", "uncertain", "benign"]}
    genomic = sorted(positions)
    return {
        "gene": protein["gene"],
        "accession": protein["accession"],
        "length": length,
        "chrom": chrom.removeprefix("chr"),
        "start": genomic[0],
        "end": genomic[-1],
        "strand": strand,
        "partners": partners,
        "variants": sorted(variants, key=lambda v: (v["position"], v["change"])),
        "classified": len(protein["variants"]),
        "interfaceResidues": len(at_residue),
        "counts": counts,
    }


def main():
    proteins = json.loads((OUT / "atlas.json").read_text())
    analysis = json.loads((OUT / "analysis.json").read_text())
    genes = [gene_record(p) for p in proteins if any((c["ipsae"] or 0) >= CONFIDENT for c in p["interfaces"])]
    (DATA_DIR / "genes").mkdir(parents=True, exist_ok=True)
    for record in genes:
        (DATA_DIR / "genes" / f"{record['gene']}.json").write_text(json.dumps(record, ensure_ascii=False))
    index = [
        {
            "gene": g["gene"],
            "accession": g["accession"],
            "partners": len(g["partners"]),
            "topPartner": g["partners"][0]["gene"],
            "bestIpsae": g["partners"][0]["ipsae"],
            "interfaceResidues": g["interfaceResidues"],
            "length": g["length"],
            **g["counts"],
        }
        for g in genes
    ]
    controlled = analysis["controlled_for_order_and_surface"]
    summary = {
        "sampled": analysis["summary"]["proteins sampled"],
        "withPartner": analysis["summary"]["with any predicted hetero complex"],
        "genes": len(genes),
        "partners": sum(len(g["partners"]) for g in genes),
        "variantsAtInterface": {label: sum(g["counts"][label] for g in genes) for label in ["pathogenic", "uncertain", "benign"]},
        "enrichment": {
            "all": controlled["all residues"],
            "orderedSurface": controlled["ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)"],
        },
        "thresholds": {"ipsae": CONFIDENT, "plddt": MIN_PLDDT, "contact": 5},
    }
    (DATA_DIR / "genes.json").write_text(json.dumps(sorted(index, key=lambda g: g["gene"]), ensure_ascii=False))
    (DATA_DIR / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"{len(genes)} gene pages, {summary['partners']} partners, {summary['variantsAtInterface']}")


if __name__ == "__main__":
    main()
