import json
import re
from pathlib import Path
from urllib.parse import urljoin

from atlas import DATA, OUT, get_json

SITE = Path(__file__).resolve().parent / "site"
CONFIDENT = 0.6
MIN_PLDDT = 70
COLOURS = {"pathogenic": "200,40,40", "uncertain": "235,140,40", "benign": "120,120,120"}
HGVS = re.compile(r"NC_0000(\d\d)\.\d+:g\.(\d+)")


def coding_positions(accession, length):
    data = get_json(f"https://www.ebi.ac.uk/proteins/api/coordinates/{accession}", DATA / "coordinates" / f"{accession}.json", {"format": "json"}) or {}
    for transcript in data.get("gnCoordinate", []):
        location = transcript["genomicLocation"]
        reverse = location.get("reverseStrand", False)
        positions = []
        for exon in location.get("exon", []):
            begin, end = exon["genomeLocation"]["begin"]["position"], exon["genomeLocation"]["end"]["position"]
            positions += list(range(begin, end - 1, -1)) if reverse else list(range(begin, end + 1))
        if len(positions) in (3 * length, 3 * length + 3):
            return f"chr{location['chromosome']}", "-" if reverse else "+", positions
    return None


def merge(positions):
    blocks = []
    for position in sorted(positions):
        if blocks and position == blocks[-1][1]:
            blocks[-1][1] = position + 1
        else:
            blocks.append([position, position + 1])
    return blocks


def bed12(chrom, strand, blocks, name, score, colour):
    start, end = blocks[0][0], blocks[-1][1]
    sizes = ",".join(str(b - a) for a, b in blocks)
    starts = ",".join(str(a - start) for a, _ in blocks)
    return f"{chrom}\t{start}\t{end}\t{name}\t{score}\t{strand}\t{start}\t{end}\t{colour}\t{len(blocks)}\t{sizes}\t{starts}"


def chromosome(number):
    return {"23": "chrX", "24": "chrY"}.get(number.lstrip("0"), f"chr{number.lstrip('0')}")


HG38 = "https://jbrowse.org/ucsc/hg38/config.json"
KEPT_TRACKS = ["hg38-ncbiRefSeqCurated", "hg38-clinvarMain"]


def bed_track(track_id, name, file, description):
    return {
        "type": "FeatureTrack",
        "trackId": track_id,
        "name": name,
        "assemblyNames": ["hg38"],
        "category": ["Interface atlas"],
        "description": description,
        "adapter": {"type": "BedAdapter", "bedLocation": {"uri": file}},
        "displays": [
            {
                "type": "LinearBasicDisplay",
                "displayId": f"{track_id}-display",
                "renderer": {"type": "SvgFeatureRenderer", "color1": "jexl:'rgb('+get(feature,'itemRgb')+')'"},
            }
        ],
    }


FILE = re.compile(r"^[\w./-]+\.(bb|bw|gz|2bit|sizes|tbi|csi|fai|gzi|bed|txt|json|ix|ixx|tsv)$")


def absolute(node):
    if isinstance(node, dict):
        return {k: absolute(v) for k, v in node.items()}
    if isinstance(node, list):
        return [absolute(v) for v in node]
    if isinstance(node, str) and FILE.match(node):
        return urljoin(HG38, node)
    return node


def write_config(default_locus):
    hg38 = absolute(get_json(HG38, DATA / "hg38_config.json"))
    tracks = [t for t in hg38["tracks"] if t["trackId"] in KEPT_TRACKS] + [
        bed_track("interfaces", "Predicted interface codons (AlphaFold DB complexes)", "interfaces.bed", f"Codons of residues within 5 Å of a partner in an AlphaFold DB heterodimer with ipSAE ≥ {CONFIDENT}, residue pLDDT ≥ {MIN_PLDDT}. One feature per partner."),
        bed_track("interface-variants", "ClinVar missense at a predicted interface", "interface_variants.bed", "ClinVar missense variants (EBI Proteins API) whose residue sits at a confident predicted interface. Red pathogenic, orange uncertain, grey benign."),
    ]
    config = {
        "assemblies": hg38["assemblies"],
        "plugins": hg38["plugins"],
        "aggregateTextSearchAdapters": hg38.get("aggregateTextSearchAdapters", []),
        "tracks": tracks,
        "defaultSession": {
            "name": "Interface atlas",
            "views": [{"type": "LinearGenomeView", "init": {"assembly": "hg38", "loc": default_locus, "tracks": ["hg38-ncbiRefSeqCurated", "interfaces", "interface-variants", "hg38-clinvarMain"]}}],
        },
    }
    (SITE / "config.json").write_text(json.dumps(config, indent=2))


def main():
    proteins = json.loads((OUT / "atlas.json").read_text())
    interfaces, variants, unmapped = [], [], []
    for protein in proteins:
        confident = [c for c in protein["interfaces"] if (c["ipsae"] or 0) >= CONFIDENT]
        if confident:
            length = max(int(k) for k in protein["context"]) if protein.get("context") else None
            mapped = coding_positions(protein["accession"], length) if length else None
            if not mapped:
                unmapped.append(protein["gene"])
            else:
                chrom, strand, positions = mapped
                partners_at = {}
                for complex_entry in confident:
                    residues = [int(r) for r, plddt in complex_entry["residues"].items() if plddt >= MIN_PLDDT and int(r) <= length]
                    for residue in residues:
                        partners_at.setdefault(residue, set()).add(complex_entry["partner_gene"] or complex_entry["partner"])
                    codons = [positions[3 * (r - 1) + k] - 1 for r in residues for k in range(3)]
                    if codons:
                        name = f"{protein['gene']}–{complex_entry['partner_gene'] or complex_entry['partner']} (ipSAE {complex_entry['ipsae']:.2f})"
                        interfaces.append(bed12(chrom, strand, merge(codons), name, int(1000 * complex_entry["ipsae"]), "40,110,200"))
                for variant in protein["variants"]:
                    match = next((HGVS.search(g) for g in variant["genomic"] if HGVS.search(g)), None)
                    if match and variant["position"] in partners_at:
                        start = int(match.group(2)) - 1
                        partners = ", ".join(sorted(partners_at[variant["position"]]))
                        name = f"{protein['gene']} {variant['change']} {variant['label']}; interface with {partners}"
                        variants.append(f"{chromosome(match.group(1))}\t{start}\t{start + 1}\t{name}\t0\t{strand}\t{start}\t{start + 1}\t{COLOURS[variant['label']]}")
    SITE.mkdir(exist_ok=True)
    order = lambda line: (line.split("\t")[0], int(line.split("\t")[1]))
    (SITE / "interfaces.bed").write_text("\n".join(sorted(interfaces, key=order)) + "\n")
    (SITE / "interface_variants.bed").write_text("\n".join(sorted(variants, key=order)) + "\n")
    preferred = next((line for line in interfaces if line.split("\t")[3].startswith("GNAO1–")), interfaces[0]).split("\t")
    write_config(f"{preferred[0]}:{int(preferred[1]) - 2000}-{int(preferred[2]) + 2000}")
    print(f"{len(interfaces)} interface features, {len(variants)} variants at confident interfaces; unmapped: {unmapped}")


if __name__ == "__main__":
    main()
