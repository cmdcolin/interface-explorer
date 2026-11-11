import csv
from collections import Counter
import gzip
import json
import re

import requests

from atlas import DATA, OUT, human_entries
from sequences import apply_edits, displayed_isoform, edits_by_isoform, mane_transcript, refseq_by_isoform

SUMMARY_URL = "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz"
SUMMARY = DATA / "variant_summary.txt.gz"
VARIANTS = OUT / "clinvar.json"
MISSENSE = re.compile(r"^(NM_\d+)\.\d+\([^)]*\):c\.\S+ \(p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})\)$")
AMINO_ACIDS = {
    "Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C", "Gln": "Q", "Glu": "E", "Gly": "G", "His": "H", "Ile": "I",
    "Leu": "L", "Lys": "K", "Met": "M", "Phe": "F", "Pro": "P", "Ser": "S", "Thr": "T", "Trp": "W", "Tyr": "Y", "Val": "V",
}
AGREEMENT = 0.95
LABELS = {
    "Pathogenic": "pathogenic",
    "Likely pathogenic": "pathogenic",
    "Pathogenic/Likely pathogenic": "pathogenic",
    "Benign": "benign",
    "Likely benign": "benign",
    "Benign/Likely benign": "benign",
    "Uncertain significance": "uncertain",
}


def download():
    if not SUMMARY.exists():
        partial = SUMMARY.with_suffix(".part")
        with requests.get(SUMMARY_URL, stream=True, timeout=600) as response:
            response.raise_for_status()
            with partial.open("wb") as out:
                for chunk in response.iter_content(1 << 20):
                    out.write(chunk)
        partial.rename(SUMMARY)


def missense_by_transcript():
    by_transcript = {}
    with gzip.open(SUMMARY, "rt", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            match = MISSENSE.match(row["Name"])
            label = LABELS.get(row["ClinicalSignificance"].split(";")[0])
            if row["Assembly"] == "GRCh38" and row["Type"] == "single nucleotide variant" and match and label and match.group(2) in AMINO_ACIDS and match.group(4) in AMINO_ACIDS:
                transcript, wild_type, position, mutant = match.groups()
                by_transcript.setdefault(transcript, []).append(
                    {
                        "position": int(position),
                        "label": label,
                        "change": f"{AMINO_ACIDS[wild_type]}{position}{AMINO_ACIDS[mutant]}",
                        "variation": int(row["VariationID"]),
                        "review": row["ReviewStatus"],
                        "chrom": row["Chromosome"],
                        "pos": int(row["PositionVCF"]),
                        "allele": f"{row['ReferenceAlleleVCF']}>{row['AlternateAlleleVCF']}",
                    }
                )
    return by_transcript


def transcript_maps(entry):
    sequence = entry["sequence"]["value"]
    canonical = (sequence, list(range(1, len(sequence) + 1)))
    displayed = displayed_isoform(entry)
    edits = edits_by_isoform(entry)
    by_isoform = refseq_by_isoform(entry)
    mane = mane_transcript(entry)
    maps = {}
    for isoform, transcripts in by_isoform.items():
        known = canonical if isoform == displayed else apply_edits(sequence, edits[isoform]["edits"]) if isoform in edits else None
        maps.update({t.split(".")[0]: known for t in transcripts})
    if mane:
        maps.setdefault(mane.split(".")[0], None)
    return maps


def to_canonical(variant, isoform_sequence, positions):
    position = variant["position"]
    canonical = positions[position - 1] if position <= len(isoform_sequence) and isoform_sequence[position - 1] == variant["change"][0] else None
    return {**variant, "position": canonical, "change": f"{variant['change'][0]}{canonical}{variant['change'][-1]}"} if canonical else None


def on_sequence(variant, sequence):
    return variant["position"] <= len(sequence) and sequence[variant["position"] - 1] == variant["change"][0]


def with_variants(proteins):
    variants = json.loads(VARIANTS.read_text())
    return [{**protein, "variants": variants.get(protein["accession"], [])} for protein in proteins]


def protein_variants(entry, by_transcript, tally):
    sequence = entry["sequence"]["value"]
    found = {}
    for transcript, known in sorted(transcript_maps(entry).items(), key=lambda item: item[1] is None):
        named = by_transcript.get(transcript, [])
        agreeing = sum(on_sequence(v, sequence) for v in named)
        trusted = known or ((sequence, list(range(1, len(sequence) + 1))) if named and agreeing >= AGREEMENT * len(named) else None)
        mapped = [to_canonical(v, *trusted) for v in named] if trusted else []
        tally["known" if known else "unassigned, agreeing" if trusted else "unassigned, rejected"] += len(named)
        tally["off the sequence"] += sum(m is None for m in mapped)
        found.update({m["variation"]: m for m in mapped if m and m["variation"] not in found})
    return sorted(found.values(), key=lambda v: (v["position"], v["change"]))


def main():
    download()
    by_transcript = missense_by_transcript()
    tally = Counter()
    variants = {entry["primaryAccession"]: protein_variants(entry, by_transcript, tally) for entry in human_entries()}
    OUT.mkdir(exist_ok=True)
    VARIANTS.write_text(json.dumps(variants))
    counts = {label: sum(v["label"] == label for vs in variants.values() for v in vs) for label in ["pathogenic", "uncertain", "benign"]}
    print(f"{sum(map(len, variants.values()))} classified missense variants on {sum(bool(v) for v in variants.values())} proteins {counts}; variants by transcript: {dict(tally)}")


if __name__ == "__main__":
    main()
