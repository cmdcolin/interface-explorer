---
name: mechanism-split
description: "Test whether interfaces are where non-loss-of-function missense lives: split the pathogenic-vs-benign interface odds ratio by truncation tolerance and inheritance mode, then give each variant a mechanism hint. Read before touching src/analyze.ts for mechanism work."
---

# Why a variant is pathogenic: splitting the interface signal by mechanism

- **Goal:** move from "where pathogenic variants land" (known since Sahni et
  al. 2015 and Interactome INSIDER 2018) to "why": which mechanism a variant
  points to, and for broken binding, which partner. The aggregate odds ratio
  becomes a supporting fact; the per-variant mechanism hint becomes a feature
  of the explorer (see `handoffs/explorer-reframe.md`).
- **State as of 2026-11-12:** claimed by the session that added homodimers
  (branch `mechanism`): labels, analysis rows and, if the split holds, the
  per-variant hint. Homodimers are now in the atlas, so the caveat below about
  their absence no longer applies.

## Hypothesis

Loss-of-function missense tends to destabilise the fold; dominant-negative,
gain-of-function and binding-loss missense tends to be mild on stability and
sit at interfaces and functional surfaces (Gerasimavicius, Livesey & Marsh
2022, https://www.nature.com/articles/s41467-022-31686-6; Badonyi & Marsh).
So the interface odds ratio should be lowest in classic loss-of-function genes
and highest in dominant genes where truncations are not pathogenic.

The atlas already hints at this: among variants AlphaMissense calls likely
benign, pathogenic ones still sit at an interface 1.44× as often (442
proteins), and AlphaMissense never sees the partner.

## Labels

- **Truncation class, per gene:** count GRCh38 rows of
  `data/variant_summary.txt.gz` with `ClinicalSignificance` P, LP or P/LP and a
  Name ending in `Ter)` or containing `fs`. 0 → `missense-only`; ≥ 2 →
  `truncation-pathogenic`; exactly 1 → excluded.
- **Inheritance, per variant:** HPO `phenotype.hpoa`
  (https://hpo.jax.org/data/annotations) gives each OMIM disease HP:0000006
  (autosomal dominant), HP:0000007 (autosomal recessive), HP:0001417 (X-linked)
  and others. Join through the variant's ClinVar `PhenotypeIDS` (OMIM ids), not
  the gene, since many genes have both dominant and recessive diseases. A
  variant with conflicting modes is excluded.
- **Dosage cross-check, per gene:** ClinGen haploinsufficiency scores
  (https://search.clinicalgenome.org/kb/downloads) and gnomAD v4 LOEUF. Use
  them to test that `missense-only` is not just under-reported truncations: the
  split should look the same restricted to genes ClinGen scores HI 0/1 or with
  high LOEUF.

Download into `data/` through `src/cache.ts` like the other sources.

## Analysis

Reuse `src/analyze.ts` unchanged in method: Mantel–Haenszel across proteins,
2,000 bootstraps over proteins, `CONTROLS` for all / ordered / ordered surface.
New rows, each under all three controls:

- missense-only vs truncation-pathogenic genes
- dominant vs recessive variants
- the cross: missense-only × dominant (predicted highest) through
  truncation-pathogenic × recessive (predicted lowest)
- the cross restricted to ClinGen HI 0/1 genes

**Prediction:** about 1.5× for truncation-pathogenic recessive, above 3× for
missense-only dominant. A flat result is reported as it is.

## Facts from the repo (computed 2026-11-12)

- 1,344 proteins have an interface in `out/atlas.json`; 796 of their genes
  have ≥ 2 pathogenic truncating variants in ClinVar, 548 have fewer. 906
  proteins are informative (both P/LP and B/LB missense), so expect the arms to
  hold a few hundred proteins each; report proteins informative per row as the
  existing rows do.
- 2,260 of 12,655 pathogenic missense (18%) sit at a confident interface, 677
  of 8,247 benign.
- Expected labels for tests: GNAO1 and PSEN1 dominant and missense-only; CFTR
  recessive; VHL dominant with pathogenic truncations.

## Outputs

- `src/mechanism.ts`: fetch and parse the label sources, label genes and
  variants; tests in `src/mechanism.test.ts` on the genes above.
- New sections in `out/analysis.json`, alongside `by_alphamissense_class`.
- If the split holds, a per-variant mechanism hint in the page data, e.g.
  "dominant, missense-only gene, at the APH1A interface: points to dominant
  negative or lost binding rather than loss of function". It is a hint built
  from position and inheritance, never stated as a mechanism.

## Caveats to carry into any write-up

- ClinVar under-reports truncations in some genes, so `missense-only` is
  partly noise; the ClinGen arm is the check.
- The 1,344 proteins are those AlphaFold DB happened to model from STRING
  pairs, not a random sample of disease genes.
- Homo-oligomer interfaces are absent (heterodimers only), so dominant
  negatives acting through self-assembly are undercounted. ACAT1's top
  "partners" ACAA2 and ACAT2 are paralogs standing in for its homotetramer.

## Later, not in this step

- Decompose the 82% of pathogenic missense not at an interface: core, ligand
  or active site, homodimer interface, disordered or motif, and unexplained
  folded surface. Clusters of unexplained surface variants are candidate
  missing partners.
- Binding versus folding ΔΔG per variant (FoldX or a learned predictor) on the
  complex and the monomer, so "breaks binding" is measured rather than
  inferred from position.

## Working rules

- Worktree branch, fast-forward onto main. Write outputs to a private
  `OUT_DIR`; other sessions overwrite `out/`.
- Run only the tests for files touched while iterating; full suite and
  typecheck once at the end. Repeat this rule in any subagent brief.
