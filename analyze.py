import json

import numpy as np

from atlas import OUT
from clinvar import with_variants
from tracks import CONFIDENT, MIN_PLDDT

THRESHOLDS = {"ipTM": [0.5, 0.6, 0.7, 0.8, 0.9], "ipSAE": [0.6, 0.7, 0.8, 0.9]}
METRIC = {"ipTM": "iptm", "ipSAE": "ipsae"}
BOOTSTRAPS = 2000


def interface_score(protein, metric):
    best = {}
    for complex_entry in protein["interfaces"]:
        for position, plddt in complex_entry["residues"].items():
            if plddt >= MIN_PLDDT:
                best[int(position)] = max(best.get(int(position), 0), complex_entry[metric] or 0)
    return best


CONTROLS = {
    "all residues": lambda context: True,
    "ordered (pLDDT ≥ 70)": lambda context: context is not None and context[0] >= MIN_PLDDT,
    "ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)": lambda context: context is not None and context[0] >= MIN_PLDDT and context[1] >= 0.2,
}


def tables(proteins, metric, threshold, keep=CONTROLS["all residues"]):
    rows = []
    for protein in proteins:
        best = interface_score(protein, metric)
        context = {int(k): v for k, v in protein.get("context", {}).items()}
        kept = [v for v in protein["variants"] if keep(context.get(v["position"]))]
        pathogenic = [v for v in kept if v["label"] == "pathogenic"]
        benign = [v for v in kept if v["label"] == "benign"]
        if pathogenic and benign:
            at = lambda variants: sum(best.get(v["position"], 0) >= threshold for v in variants)
            rows.append((at(pathogenic), len(pathogenic) - at(pathogenic), at(benign), len(benign) - at(benign)))
    return np.array(rows, dtype=float)


def mantel_haenszel(rows):
    if not len(rows):
        return float("nan")
    a, b, c, d = rows.T
    n = rows.sum(axis=1)
    numerator, denominator = (a * d / n).sum(), (b * c / n).sum()
    return numerator / denominator if denominator else float("inf")


def bootstrap(rows, seed=0):
    rng = np.random.default_rng(seed)
    values = [mantel_haenszel(rows[rng.integers(0, len(rows), len(rows))]) for _ in range(BOOTSTRAPS)]
    return [round(float(v), 2) for v in np.nanpercentile(values, [2.5, 97.5])]


def main():
    proteins = with_variants(json.loads((OUT / "atlas.json").read_text()))
    with_complex = [p for p in proteins if p["hetero"]]
    confident = [p for p in proteins if any((c["ipsae"] or 0) >= CONFIDENT for c in p["interfaces"])]
    summary = {
        "disease proteins": len(proteins),
        "with any predicted hetero complex": len(with_complex),
        f"with a partner at ipSAE ≥ {CONFIDENT}": len(confident),
        "classified missense variants in proteins with a complex": {label: sum(v["label"] == label for p in with_complex for v in p["variants"]) for label in ["pathogenic", "benign", "uncertain"]},
    }
    enrichment = {}
    for name, thresholds in THRESHOLDS.items():
        for threshold in thresholds:
            rows = tables(with_complex, METRIC[name], threshold)
            a, b, c, d = rows.sum(axis=0) if len(rows) else (0, 0, 0, 0)
            enrichment[f"{name} ≥ {threshold}"] = {
                "proteins informative": int(len(rows)),
                "pathogenic at interface": f"{int(a)}/{int(a + b)}",
                "benign at interface": f"{int(c)}/{int(c + d)}",
                "Mantel–Haenszel odds ratio": round(float(mantel_haenszel(rows)), 2),
                "95% CI (bootstrap over proteins)": bootstrap(rows) if len(rows) > 2 else None,
            }
    controlled = {}
    for name, keep in CONTROLS.items():
        rows = tables([p for p in with_complex if p.get("context")], "ipsae", CONFIDENT, keep)
        a, b, c, d = rows.sum(axis=0) if len(rows) else (0, 0, 0, 0)
        controlled[name] = {
            "proteins informative": int(len(rows)),
            "pathogenic at interface": f"{int(a)}/{int(a + b)}",
            "benign at interface": f"{int(c)}/{int(c + d)}",
            "Mantel–Haenszel odds ratio": round(float(mantel_haenszel(rows)), 2),
            "95% CI (bootstrap over proteins)": bootstrap(rows) if len(rows) > 2 else None,
        }
    uncertain = []
    for protein in proteins:
        best = interface_score(protein, "ipsae")
        for variant in protein["variants"]:
            if variant["label"] == "uncertain" and best.get(variant["position"], 0) >= CONFIDENT:
                partners = sorted(
                    {c["partner_gene"] or c["partner"] for c in protein["interfaces"] if (c["ipsae"] or 0) >= CONFIDENT and str(variant["position"]) in c["residues"]}
                )
                uncertain.append((protein["gene"], variant["change"], round(best[variant["position"]], 2), ", ".join(partners)))
    uncertain.sort(key=lambda row: -row[2])
    summary["uncertain variants at a confident interface"] = len(uncertain)
    result = {"summary": summary, "controlled_for_order_and_surface": controlled, "enrichment": enrichment, "uncertain_examples": uncertain[:25]}
    (OUT / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
