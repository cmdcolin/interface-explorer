def alternative_products(entry):
    return next((c["isoforms"] for c in entry.get("comments", []) if c.get("commentType") == "ALTERNATIVE PRODUCTS"), [])


def displayed_isoform(entry):
    return next((i["isoformIds"][0] for i in alternative_products(entry) if i.get("isoformSequenceStatus") == "Displayed"), None)


def edits_by_isoform(entry):
    vsps = {f["featureId"]: f for f in entry.get("features", []) if f["type"] == "Alternative sequence"}
    return {
        isoform["isoformIds"][0]: {
            "name": isoform.get("name", {}).get("value", ""),
            "displayed": isoform.get("isoformSequenceStatus") == "Displayed",
            "edits": sorted(
                (
                    vsps[v]["location"]["start"]["value"],
                    vsps[v]["location"]["end"]["value"],
                    (vsps[v].get("alternativeSequence", {}).get("alternativeSequences") or [""])[0],
                )
                for v in isoform.get("sequenceIds", [])
                if v in vsps
            ),
        }
        for isoform in alternative_products(entry)
        if isoform.get("isoformSequenceStatus") in ("Displayed", "Described")
    }


def shared_ends(original, replacement):
    prefix = 0
    while prefix < min(len(original), len(replacement)) and original[prefix] == replacement[prefix]:
        prefix += 1
    suffix = 0
    while suffix < min(len(original), len(replacement)) - prefix and original[-1 - suffix] == replacement[-1 - suffix]:
        suffix += 1
    return prefix, suffix


def replaced_positions(sequence, start, end, replacement):
    original = sequence[start - 1 : end]
    if len(original) == len(replacement):
        return [start + k if letter == original[k] else None for k, letter in enumerate(replacement)]
    prefix, suffix = shared_ends(original, replacement)
    middle = len(replacement) - prefix - suffix
    return [start + k for k in range(prefix)] + [None] * middle + [end - suffix + 1 + k for k in range(suffix)]


def apply_edits(sequence, edits):
    residues = [(letter, position) for position, letter in enumerate(sequence, start=1)]
    for start, end, replacement in sorted(edits, reverse=True):
        residues[start - 1 : end] = list(zip(replacement, replaced_positions(sequence, start, end, replacement)))
    return "".join(letter for letter, _ in residues), [position for _, position in residues]


def refseq_by_isoform(entry):
    by_isoform = {}
    for xref in entry.get("uniProtKBCrossReferences", []):
        if xref["database"] == "RefSeq":
            for nucleotide in (p["value"] for p in xref.get("properties", []) if p["key"] == "NucleotideSequenceId"):
                if nucleotide.startswith("NM_"):
                    by_isoform.setdefault(xref.get("isoformId"), []).append(nucleotide)
    return by_isoform


def mane_transcript(entry):
    return next(
        (p["value"] for x in entry.get("uniProtKBCrossReferences", []) if x["database"] == "MANE-Select" for p in x.get("properties", []) if p["key"] == "RefSeqNucleotideId"),
        None,
    )
