import json
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from atlas import DATA, OUT, disease_entries, get_json
from clinvar import VARIANTS
from sequences import apply_edits, edits_by_isoform, mane_transcript, refseq_by_isoform
from tracks import CONFIDENT, MIN_PLDDT, coding_positions

SITE_DATA = Path(__file__).resolve().parent / "site" / "data"
FOLDED = 70
UNFOLDED = 50
MOST = 0.5


def segments(canonical_positions):
    runs = []
    for index, position in enumerate(canonical_positions):
        if position is not None and runs and runs[-1][1] + runs[-1][2] == position and runs[-1][0] + runs[-1][2] == index + 1:
            runs[-1][2] += 1
        elif position is not None:
            runs.append([index + 1, position, 1])
    return runs


def full_models(accession):
    models = get_json(f"https://alphafold.ebi.ac.uk/api/prediction/{accession}", DATA / "monomers" / f"{accession}.json") or []
    return {
        m["uniprotAccession"]: m
        for m in models
        if m.get("uniprotStart") == 1 and m.get("uniprotEnd") == len(m.get("sequence", "")) and "-F1-" in m.get("cifUrl", "")
    }


def plddt(model):
    return get_json(model["plddtDocUrl"], DATA / "plddt" / f"{model['entryId']}.json", keep=lambda doc: [round(score) for score in doc["confidenceScore"]])


def confident_interfaces(atlas_protein):
    interfaces = {
        complex_entry["partner_gene"] or complex_entry["partner"]: {int(r) for r, score in complex_entry["residues"].items() if score >= MIN_PLDDT}
        for complex_entry in (atlas_protein or {}).get("interfaces", [])
        if (complex_entry["ipsae"] or 0) >= CONFIDENT
    }
    return {partner: residues for partner, residues in interfaces.items() if residues}


def isoform_record(isoform_id, info, model, sequence, positions, scores, canonical_sequence, canonical_plddt, transcripts, pathogenic, interfaces):
    kept = {p for p in positions if p is not None}
    shared = [(score, canonical_plddt[p - 1]) for p, score in zip(positions, scores) if p is not None]
    lost_sites = sorted({position for position, _ in pathogenic if position not in kept})
    return {
        "accession": isoform_id,
        "name": info["name"],
        "model": model["entryId"],
        "cif": model["cifUrl"],
        "length": len(sequence),
        "meanPlddt": round(sum(scores) / len(scores), 1),
        "plddt": scores,
        "segments": segments(positions),
        "edits": [{"start": s, "end": e, "original": canonical_sequence[s - 1 : e], "replacement": r} for s, e, r in info["edits"]],
        "refseq": transcripts.get(isoform_id, []),
        "foldedChanged": sum(score >= FOLDED for p, score in enumerate(canonical_plddt, start=1) if p not in kept),
        "unfolded": sum(canonical >= FOLDED and own < UNFOLDED for own, canonical in shared),
        "pathogenicLost": lost_sites,
        "pathogenicChanges": [change for position, change in sorted(pathogenic) if position not in kept],
        "interfaceLost": {
            partner: [len(residues - kept), len(residues)]
            for partner, residues in sorted(interfaces.items(), key=lambda item: -len(item[1] - kept) / len(item[1]))
            if residues - kept
        },
    }


def gene_record(entry, atlas_by_accession, variants):
    accession = entry["primaryAccession"]
    gene = entry.get("genes", [{}])[0].get("geneName", {}).get("value", "") or accession
    isoforms = edits_by_isoform(entry)
    models = full_models(accession) if len(isoforms) > 1 else {}
    displayed = next((i for i, info in isoforms.items() if info["displayed"]), None)
    sequence = entry["sequence"]["value"]
    canonical_plddt = plddt(models[accession]) if accession in models and models[accession]["sequence"] == sequence else None
    built = {i: apply_edits(sequence, isoforms[i]["edits"]) for i in isoforms if i != displayed and i in models}
    matching = {i: (seq, positions, plddt(models[i])) for i, (seq, positions) in built.items() if seq == models[i]["sequence"]}
    alternatives = {i: value for i, value in matching.items() if value[2]}
    if not (canonical_plddt and alternatives):
        return None
    mane = mane_transcript(entry)
    transcripts = {isoform: sorted(nms, key=lambda nm: nm != mane) for isoform, nms in refseq_by_isoform(entry).items()}
    pathogenic = [(v["position"], v["change"]) for v in variants.get(accession, []) if v["label"] == "pathogenic"]
    interfaces = confident_interfaces(atlas_by_accession.get(accession))
    mapped = coding_positions(accession, len(sequence))
    return {
        "gene": gene,
        "accession": accession,
        "length": len(sequence),
        "locus": f"{mapped[0]}:{min(mapped[2])}-{max(mapped[2])}" if mapped else None,
        "canonical": {
            "accession": displayed,
            "name": isoforms[displayed]["name"],
            "model": models[accession]["entryId"],
            "cif": models[accession]["cifUrl"],
            "meanPlddt": round(sum(canonical_plddt) / len(canonical_plddt), 1),
            "plddt": canonical_plddt,
            "refseq": transcripts.get(displayed, []),
        },
        "described": len(isoforms),
        "unmatched": len(built) - len(matching),
        "partners": sorted(interfaces),
        "pathogenic": sorted({position for position, _ in pathogenic}),
        "interface": sorted(set().union(*interfaces.values())),
        "isoforms": [
            isoform_record(i, isoforms[i], models[i], *alternatives[i], sequence, canonical_plddt, transcripts, pathogenic, interfaces)
            for i in sorted(alternatives, key=lambda i: int(i.rsplit("-", 1)[1]))
        ],
    }


def safe_record(entry, atlas_by_accession, variants):
    try:
        return gene_record(entry, atlas_by_accession, variants)
    except Exception as error:
        print(f"{entry['primaryAccession']}: {type(error).__name__}: {error}", flush=True)
        return None


def summary_row(record):
    isoforms = record["isoforms"]
    return {
        "gene": record["gene"],
        "page": record["page"],
        "accession": record["accession"],
        "described": record["described"],
        "modelled": len(isoforms) + 1,
        "shortest": min(i["length"] for i in isoforms),
        "length": record["length"],
        "foldedChanged": max(i["foldedChanged"] for i in isoforms),
        "unfolded": max(i["unfolded"] for i in isoforms),
        "pathogenicLost": max(len(i["pathogenicLost"]) for i in isoforms),
        "interfaceLost": sum(any(lost >= MOST * total for lost, total in i["interfaceLost"].values()) for i in isoforms),
    }


def main(workers=4, *accessions):
    with_isoforms = [e for e in disease_entries() if len(edits_by_isoform(e)) > 1]
    entries = [e for e in with_isoforms if not accessions or e["primaryAccession"] in accessions]
    atlas_path = OUT / "atlas.json"
    atlas_by_accession = {p["accession"]: p for p in json.loads(atlas_path.read_text())} if atlas_path.exists() else {}
    variants = json.loads(VARIANTS.read_text())
    with ThreadPoolExecutor(int(workers)) as pool:
        records = [r for r in pool.map(lambda e: safe_record(e, atlas_by_accession, variants), entries) if r]
    repeated = Counter(r["gene"] for r in records)
    (SITE_DATA / "isoforms").mkdir(parents=True, exist_ok=True)
    for record in records:
        record["page"] = record["gene"] if repeated[record["gene"]] == 1 else f"{record['gene']}_{record['accession']}"
        (SITE_DATA / "isoforms" / f"{record['page']}.json").write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
    index = {"checked": len(entries), "described": len(with_isoforms), "genes": sorted((summary_row(r) for r in records), key=lambda r: r["page"])}
    (SITE_DATA / "isoforms.json").write_text(json.dumps(index, ensure_ascii=False))
    print(f"{len(records)} genes, {sum(len(r['isoforms']) for r in records)} alternative isoforms; {sum(r['unmatched'] for r in records)} left out for differing from their model's sequence")


if __name__ == "__main__":
    main(*sys.argv[1:])
