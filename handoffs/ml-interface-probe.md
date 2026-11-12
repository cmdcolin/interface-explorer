---
name: ml-interface-probe
description: "Colin's hands-on ML project on the atlas: a protein-language-model interface predictor graded on experimental PDB interfaces, then a conditioned pathogenicity test on proteins with no AlphaFold complex. Read before writing anything under ml/."
---

# ML on the atlas: an interface probe graded on experiment

- **Goal:** hands-on ML that would stand up to a skeptical computational
  biologist, shown visually. The project should teach splits, class imbalance,
  positive-unlabeled labels, baselines, calibration and a real training loop.
- **Shape:** plain PyTorch/sklearn CLI scripts in `ml/`, with files between
  them. No notebooks and no Weights & Biases. GPU jobs run on ada.
- **State as of 2026-11-12:** planned and reviewed twice, by three Opus/Fable
  reviewers and then one Fable reviewer, all with web search. No code yet.

Claim a step here before starting it.

## Rules

- **The test label is never AlphaFold's.** The model trains on AlphaFold DB
  interface labels, and the headline grade is on experimental PDB interfaces.
  An AlphaFold label grading an AlphaFold-derived score is circular.
- **Freeze the test set before any tuning**, including the clusters of the
  PDB pairs deposited after AlphaFold's 2021-09-30 training cutoff (about 173
  pairs). Grading on clusters the model trained on is not a test.
- **Split by connected component of the union** of the diamond homology graph
  and the protein-pair graph, never by residue or single protein. Paralogs share
  partners (every Gα is modelled with Gβ), so a per-protein split leaks through
  the partner. Even this split leaks some (Bushuiev et al.,
  https://arxiv.org/abs/2404.10457), so show the split-gap bars as a lower bound.
- **Train and score on folded, exposed residues** (pLDDT ≥ 70, RSA ≥ 0.2),
  proteins with a confident complex only. The label requires pLDDT ≥ 70, so on
  all residues a model scores well by decoding "ordered and exposed".
- **Negatives are unlabeled, not negative.** The median protein has 1
  confident partner, and AFDB modelled only STRING pairs. Say
  positive-unlabeled in every write-up, and report the ≥ 3-partner subset
  alongside.
- **Variant tests use P/LP versus B/LB only, within protein**: conditional
  logistic regression stratified by protein, bootstrapped over proteins as
  `bootstrap()` in `src/analyze.ts` does. A pooled ROC is gene-confounded: the
  top 20 genes hold 31% of the pathogenic interface variants.
- **ClinVar favours AlphaMissense.** Its thresholds and model selection were
  tuned on ClinVar, and its benign training labels overlap ClinVar's benign
  evidence. Report the variants first classified after 2023-09 separately, and
  state the label vintage. ClinVar P/LP can also rest on PM1/PP3 hotspot or
  predictor evidence; state that as a limitation.
- **Use Brandes et al. 2023's published ESM1b scores** for the ESM
  log-likelihood-ratio covariate
  (https://www.nature.com/articles/s41588-023-01465-0). Do not recompute them:
  ESM-2 650M is no better zero-shot on ProteinGym.

## Facts from the repo (computed 2026-11-12)

- **Labels:** a residue is positive if it is in any `ipsae ≥ 0.6` interface's
  `residues` with pLDDT ≥ 70 in `out/atlas.json`. Per-residue `[plddt, rsa]` is
  in each protein's `context`, from the monomer model in `src/atlas.ts`.
  `SURFACE = 0.2` is set in `src/analyze.ts`.
- **Label counts:** 1,344 of 5,350 proteins have a confident complex, with
  79,871 positive residues of 660,209 (12.1%). On folded, exposed residues it
  is 56,108 positive against 216,904 (20.6%).
- **Trivial baselines:** pLDDT alone gives AUC 0.617 on all residues. RSA alone
  gives 0.522 within folded, exposed residues.
- **Homology:** `diamond` is at `~/.local/bin/diamond` on the laptop. It is not
  on ada, and neither is MMseqs2 or Foldseek anywhere.
  - An all-vs-all at ≥ 30% identity and ≥ 50% coverage gives 1,041
    single-linkage clusters over the 1,344, the largest of 26.
  - 34% of the 1,344 have a labelled homolog.
- **Pair graph:** 552 components over the 1,344, the largest of 115. The hubs
  are tubulins and SKP1. The union with the homology graph has not been
  computed; it may merge into one giant component. Measure it first.
- **Variants at an interface:** 2,550 P/LP, 825 B/LB and 23,328 VUS. Only 214
  genes have both P and B there.
- **Proteins with no complex:** 4,006 of them, holding 57,014 P/LP and 76,296
  B/LB, with 2,752 having both.
- **Sequences:** canonical sequences for all 5,350 are in
  `data/uniprot_disease.json` (`sequence.value`) and match `atlas.json`
  lengths.
  - 105 of the 1,344 exceed ESM-2's 1,022-residue limit, and they hold 18.7%
    of the residues. Window them as Brandes does: tile from both ends with at
    least 511 residues of overlap, then sigmoid-weighted average.
  - Per-residue ESM-2 650M embeddings for the 660k residues take about 1.7 GB
    in fp16.
- **The experimental check stores counts only.** `out/experimental.json` holds
  834 pairs, of which the README says 827.
  - `interfaceAgreement` in `src/experimental.ts` must return its
    `experimental` and `observed` residue sets.
  - `data/pdbe/` caches 507 CIFs, for the current pairs only.
  - `data/sifts/pdb_chain_uniprot.tsv.gz` maps all of PDB. Grading proteins
    with no complex needs more structures downloaded.
- **Integration:** Python writes `out/<name>.json` shaped like
  `out/alphamissense.json` (`{accession: {change: score}}`, read by
  `readScores` in `src/alphamissense.ts`). `analyze.ts` and `pages.ts` each
  take one more field. Large per-gene arrays go to their own
  `site/data/<name>/<GENE>.json`, not `genes/<GENE>.json`, which
  `web/lib/data.ts` reads at build time.

## Steps

- **Measure the split.** Take the union of the diamond graph (re-run it, since
  the 2026-11-12 hits were in a session scratchpad) and the pair graph, then
  report component sizes.
  - If one component swallows most proteins, decide how to cut it, for example
    by raising the identity threshold or dropping hub partners from the pair
    graph, and record the choice here.
  - Then freeze `ml/splits.json`, with the post-cutoff PDB clusters in the test
    fold.
- **Per-residue experimental labels.** Make `src/experimental.ts` write the
  residue sets. Pick PDB co-complexes for a sample of no-complex proteins from
  SIFTS and cache them.
- **Tabular baseline:** logistic regression on RSA, pLDDT, phyloP, amino acid
  and per-position mean AlphaMissense. Show:
  - split-gap bars for random residue, protein and component splits;
  - PR curves on the AF test fold and on PDB interfaces.
- **ESM-2 650M embeddings and a linear probe**, with a layer sweep of three
  layers. Show:
  - PR curves against the baseline, with the positive prior drawn;
  - a reliability diagram;
  - probe probability painted in the 3D view beside the AlphaFold interface,
    failures included.
  - **This, graded on PDB interfaces including no-complex proteins, is the
    minimum "real" result.**
- **From-scratch CNN on one-hot sequence**, same split. This is the training
  lesson: the loop, overfitting and learning curves. It is also the third
  model-quality point for the attenuation figure.
- **Cross-fit:** out-of-fold scores for every residue, each from a model that
  never saw the protein's component.
- **Q2, the only plausibly new finding:** on the ~4,006 no-complex proteins, is
  the out-of-fold interface score enriched for P over B?
  - Test within protein, on the folded surface, conditioning on AlphaMissense,
    the ESM1b LLR and phyloP. Without the last two it measures a second
    conservation score.
  - Validate the probe on these proteins against PDB first, since they are a
    shifted population.
- **Q1 as a figure, not a claim.** On the 1,344, show how the AF interface's
  odds ratio attenuates as the learned score improves (baseline, probe, CNN),
  with the readout stated before running. Repeat with PDB interface residues as
  the label.
  - Do not write "partner information invisible to single-sequence models":
    AlphaMissense reads MSAs and AlphaFold structure context.

## Before claiming novelty

- Read the results sections of the nearest work. Reviewers saw only abstracts:
  the full texts returned 429s or bot checks.
  - PIONEER (https://doi.org/10.1038/s41587-024-02428-4).
  - Jänes et al. 2024 (https://pmc.ncbi.nlm.nih.gov/articles/PMC11160786/).
  - Interactome INSIDER (https://www.pubmed.gov/29355848/).
- Enrichment of disease mutations at predicted interfaces is published. The
  claimable part is the within-protein, within-AlphaMissense-class,
  surface-restricted form, conditioned on ESM and conservation.
- Realistic ceiling for partner-agnostic sequence predictors: AUROC about 0.80
  (PIPENN-EMB, https://www.biorxiv.org/content/10.1101/2024.10.31.621117).
  Interface definitions differ across papers, so their numbers do not compare
  directly with ours.

## Optional, after the above

- A LoRA fine-tune of ESM-2, as a fourth point on the attenuation figure.
- Dominant-negative versus loss-of-function, run as a descriptive replication
  of Gerasimavicius et al. 2022
  (https://pmc.ncbi.nlm.nih.gov/articles/PMC9259657/) and Badonyi and Marsh,
  using their per-gene predictions (https://osf.io/z4dcp/). It is not a
  headline, and it is underpowered within AlphaMissense-benign.

## Declined

- **UMAP of mean-pooled embeddings:** it mostly recovers length and family,
  and 2D neighbourhoods disagree with the high-dimensional ones (Chari and
  Pachter 2023).
- **ESMFold:** structure predictors barely move for point mutations, and
  AlphaFold DB already models the isoforms.
- **An MLP probe:** it teaches nothing the linear probe and the CNN don't.
- **Recomputed ESM-2, SaProt or ProSST scores:** plumbing that tests neither
  question.
- **The per-gene 20×L mutation heatmap:** plumbing that tests neither question.
- **A ProteinGym DMS check:** plumbing that tests neither question.
- **A pooled ESM-versus-AlphaMissense scatter:** it re-shows ClinVar's bias.
- **Partner-aware concatenated-pair ESM scoring:** out of distribution for
  ESM-2.
- **A per-gene "nearest proteins by embedding" list:** embedding search was
  declined in the seq2track project.
