import json
from collections import Counter
from pathlib import Path

from atlas import CONTACT, OUT
from clinvar import downloaded, with_variants
from tracks import CONFIDENT, MIN_PLDDT, coding_positions

DATA_DIR = Path(__file__).resolve().parent / "site" / "data"


def runs(residues):
    spans = []
    for residue in sorted(residues):
        if spans and residue <= spans[-1][1] + 1:
            spans[-1][1] = residue
        else:
            spans.append([residue, residue])
    return ", ".join(f"{a}" if a == b else f"{a}–{b}" for a, b in spans)


def gene_record(protein, chrom, strand, positions):
    length = protein["length"]
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
        if variant["position"] in at_residue:
            variants.append(
                {
                    "change": variant["change"],
                    "label": variant["label"],
                    "position": variant["position"],
                    "partners": sorted(set(at_residue[variant["position"]])),
                    "variation": variant["variation"],
                    "review": variant["review"],
                    "chrom": variant["chrom"],
                    "pos": variant["pos"],
                    "allele": variant["allele"],
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
    proteins = with_variants(json.loads((OUT / "atlas.json").read_text()))
    analysis = json.loads((OUT / "analysis.json").read_text())
    confident = [p for p in proteins if any((c["ipsae"] or 0) >= CONFIDENT for c in p["interfaces"])]
    mapped = [(p, coding_positions(p["accession"], p["length"])) for p in confident]
    genes = [gene_record(p, *coordinates) for p, coordinates in mapped if coordinates]
    unmapped = [p["gene"] for p, coordinates in mapped if not coordinates]
    repeated = Counter(g["gene"] for g in genes)
    (DATA_DIR / "genes").mkdir(parents=True, exist_ok=True)
    for record in genes:
        record["page"] = record["gene"] if repeated[record["gene"]] == 1 else f"{record['gene']}_{record['accession']}"
        (DATA_DIR / "genes" / f"{record['page']}.json").write_text(json.dumps(record, ensure_ascii=False))
    index = [
        {
            "gene": g["gene"],
            "page": g["page"],
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
        "proteins": analysis["summary"]["disease proteins"],
        "withPartner": analysis["summary"]["with any predicted hetero complex"],
        "genes": len(genes),
        "unmapped": len(unmapped),
        "partners": sum(len(g["partners"]) for g in genes),
        "variantsAtInterface": {label: sum(g["counts"][label] for g in genes) for label in ["pathogenic", "uncertain", "benign"]},
        "enrichment": {
            "all": controlled["all residues"],
            "orderedSurface": controlled["ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)"],
        },
        "thresholds": {"ipsae": CONFIDENT, "plddt": MIN_PLDDT, "contact": CONTACT},
        "provenance": {"clinvarDownloaded": downloaded()},
    }
    (DATA_DIR / "genes.json").write_text(json.dumps(sorted(index, key=lambda g: g["gene"]), ensure_ascii=False))
    (DATA_DIR / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"{len(genes)} gene pages, {summary['partners']} partners, {summary['variantsAtInterface']}; {len(unmapped)} genes with a confident partner left out because their coding coordinates don't map: {unmapped[:20]}")


if __name__ == "__main__":
    main()
