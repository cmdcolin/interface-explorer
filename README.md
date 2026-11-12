# interface-atlas

**TL;DR:** for every human disease gene, which codons sit at an interface in an
AlphaFold DB predicted complex, which ClinVar missense variants fall there, and
how each alternative isoform's predicted structure differs from the canonical
one.

**Live:** https://cmdcolin.github.io/interface-atlas/

- **Genes:** a searchable table of the 1,331 disease genes with a confident
  predicted partner. Each gene page lists its partners, a protein map and the
  ClinVar variants at an interface, each with its AlphaMissense score. It
  launches JBrowse on the genome, or a variant inside its complex beside the
  genome with the variant marked.
- **Isoforms:** for disease genes with AlphaFold DB isoform models, where each
  isoform differs from the canonical protein, whether the part they share keeps
  its predicted fold, and which pathogenic sites and partner interfaces it
  lacks. Each isoform opens superposed on the canonical model, linked to its own
  transcript.
- **GPCRs:** experimental receptor–G protein interfaces from 23 cryo-EM and
  X-ray complexes of biogenic amine receptors, the receptor-facing surface of
  each Gα, and how AlphaFold DB's predicted interfaces compare.
- **JBrowse** at `/jbrowse/`, with the tracks below.

## Tracks

- **Predicted interface codons:** one feature per partner, e.g.
  "GNAO1–GNB2 (ipSAE 0.73)". The codons are those of residues within 5 Å of
  the partner in an AlphaFold DB heterodimer with ipSAE ≥ 0.6 and residue
  pLDDT ≥ 70.
- **ClinVar missense at a predicted interface:** red is pathogenic, orange is
  uncertain significance, grey is benign.
- **Experimental GPCR–G protein interface codons** and **ClinVar missense at
  an experimental GPCR–G protein interface**: the same, from the PDB complexes
  on the GPCRs page, one feature per structure and side, e.g. "DRD1–GNAS
  (7JVQ)".
- All are bigBed. Alongside: NCBI RefSeq genes and UCSC's ClinVar track.

## What we found (all 5,350 UniProt disease proteins)

- 1,344 (25%) have an AlphaFold DB heterodimer; all of AlphaFold DB's
  heterodimers have ipSAE ≥ 0.6, its "tentatively high-confidence" threshold.
- Within each protein, pathogenic missense variants sit at a predicted
  interface 2.4× as often as benign ones (Mantel–Haenszel odds ratio, 95% CI
  2.0–2.8, 906 proteins with both). Counting only folded, surface-exposed
  residues, it is 3.2× (2.7–4.0), so the effect is not just "folded vs
  disordered".
- Folded residues alone give 1.7× (1.4–2.0): the buried core is rich in
  pathogenic variants and is not an interface, which is why the surface
  comparison is the fair one.
- The signal does not depend on confidence. Against residues at no interface,
  the odds ratio is 2.5 for ipSAE 0.6–0.7, 2.7 for 0.7–0.8, 2.1 for 0.8–0.9
  and 2.4 (1.4–4.8) at 0.9 and above.
- The interface adds to AlphaMissense, modestly. Among variants AlphaMissense
  calls likely benign, the pathogenic ones still sit at an interface 1.4× as
  often as the benign ones (1.1–1.9, 442 proteins); among those it calls
  likely pathogenic, 1.4× (1.0–2.0, 309 proteins). Too few are ambiguous to
  say (0.7×, 0.4–1.2, 128 proteins).
- 26,588 classified missense variants sit at a confident interface: 2,533
  pathogenic, 23,233 of uncertain significance and 822 benign. Examples:
  VHL's 48 pathogenic variants at the elongin C interface, and GNAO1's at the
  Gβ (L13P, I19M, L23F) and RGS (T182I, Q205P, R206) interfaces.
- AlphaMissense scores 23,068 of the 23,233 uncertain ones and calls 10,756
  (47%) likely pathogenic, against 88% of the pathogenic and 17% of the benign
  variants at an interface. It sees one protein at a time, not the partner.
- 98.8% of those variants' genomic positions fall inside their gene's
  interface codons, an independent check of the residue → codon mapping. The
  rest belong to proteins encoded by several identical genes (histones H3.3
  and H4, calmodulin, α-globin): the codons are drawn on one copy and ClinVar
  names another.

## Isoforms (all 3,423 disease genes with described isoforms)

- AlphaFold DB models at least one alternative isoform for 3,302 of them:
  7,648 isoforms. All but 4 rebuilt isoform sequences match their model;
  those 4 are left out.
- 2,123 isoforms lack at least one residue where ClinVar has a pathogenic
  missense variant on the canonical protein.
- 290 isoforms lack half or more of a predicted partner interface. Example:
  APP695 (P05067-4), the neuronal isoform, has no Kunitz inhibitor domain, so it
  lacks most of APP's predicted interfaces with the proteases KLK11, KLK14 and
  prostasin; APP751, which keeps the domain, lacks none of them.
- 260 isoforms drop at least 10 residues they share with the canonical protein
  from confident (pLDDT ≥ 70) to very low (< 50), e.g. PRDM1 isoform 3 and
  MYLK isoform 4.

## GPCRs and their G proteins (23 experimental complexes)

- The structures are a GPCRdb selection of dopamine, serotonin, adrenergic and
  histamine receptors made by BioHackathon Europe 2026 Project 9
  (`gpcr_structures.tsv`): 23 with a G protein bound, 22 without.
- Gαs has no AlphaFold DB complex with a GPCR, but 8 experimental Gs complexes
  and the Gαs scaffold of 4 engineered chimeras put 46 of its residues against
  a receptor. 10 ClinVar pathogenic variants sit on them, most on the
  C-terminal α5 helix: R342Q, R347T, G353R, F376V, C379Y, D381V, Q384E, R385H,
  L388R and E392K.
- Where AlphaFold DB has a comparable prediction, it finds the experimental
  surface: its GPCR complexes of Gαi1 cover 90% of the residues the 10
  experimental Gi1 complexes use (68% of its residues are among them), its
  RHO–Gαo complex covers 88% of 5-HT1B–Gαo's, and its DRD5–Golf complex covers
  87% of the receptor residues DRD5 uses against Gs. Its GPCR complexes of Gαq
  cover all 11 α5 residues the three mini-Gq chimeras carry.
- Every receptor is looked up in AlphaFold DB, disease protein or not. Only
  DRD5 (with Golf) and HRH4 (with Gα14, covering 66% of the residues HRH4 uses
  against Gi1) have a predicted complex with a Gα.
- On the receptor side, 78 ClinVar variants of uncertain significance and 2
  benign ones contact the G protein; none is classified pathogenic.

## Caveats

- Coverage: AlphaFold DB modelled STRING physical-interaction pairs only;
  TP53 has none and KRAS has no RAF.
- The complexes and isoform models are predictions. A low isoform pLDDT where
  the canonical model is confident hints that the isoform does not keep that
  part folded; it is not a measurement.
- An interface variant is a lead, not a mechanism: the residue may matter for
  folding or for another partner.
- 13 disease genes with a confident partner are left out because the EBI
  Proteins API gives no primary-assembly coding coordinates that match their
  length.

## Method

- **Proteins:** all reviewed human UniProt entries with a disease annotation.
- **Complexes:** AlphaFold DB heterodimers (up to 30 per protein, by ipSAE).
  Interface residues have a heavy atom within 5 Å of the partner and pLDDT
  ≥ 70. Codons come from EBI Proteins API coordinates on the primary hg38
  chromosomes.
- **Variants:** NCBI ClinVar `variant_summary` single-nucleotide missense
  variants classified pathogenic, likely pathogenic, uncertain, likely benign
  or benign; conflicting classifications are left out. Each is named on a
  RefSeq transcript. UniProt says which isoform that transcript encodes, and the
  variant is mapped through that isoform to the canonical residue. Transcripts
  UniProt assigns to no isoform are used only when 95% of their variants match
  the canonical sequence, and every variant's wild-type residue must match.
- **AlphaMissense:** the published pathogenicity of every substitution in the
  canonical proteins, joined to each variant by UniProt accession and change.
  Above 0.564 is likely pathogenic and below 0.34 likely benign.
- **GPCRs:** PDBe's updated mmCIF gives each atom's UniProt position (SIFTS).
  The receptor chain is GPCRdb's preferred chain, aligned to its UniProt
  sequence where SIFTS does not map it; Gα chains are found by SIFTS gene or
  entity name. Non-human proteins are aligned to the human ortholog; a contact
  residue that differs from the human one is still mapped, and marked. Four
  engineered chimeric Gα chains map to no gene: each is split into segments by
  the human Gα it matches best, favouring the Gα the structure is annotated
  with, so a mini-Gq gives its α5 helix to GNAQ and its scaffold to GNAS. Only
  receptor–Gα contacts are counted, not those with Gβγ.
- **Isoforms:** each isoform's sequence is rebuilt from UniProt's
  alternative-sequence edits and must equal its AlphaFold DB model's sequence;
  that gives each isoform residue its canonical position. A replaced stretch
  keeps the residues it shares with the canonical at either end, and one of the
  same length is compared residue by residue.

## Run

- `pnpm install`, then `pnpm all` runs every step below in order; `pnpm test`
  runs the unit tests and `pnpm typecheck` the type check.
- `pnpm atlas [workers]`: fetches the complexes, models and monomer context for
  every disease protein, into `out/atlas.json`. Downloads are cached in
  `data/`; keep workers at 3–4, since AlphaFold DB rate-limits. Proteins that
  fail are listed in `out/atlas_failures.json`.
- `pnpm clinvar`: downloads ClinVar's `variant_summary.txt.gz` and writes
  `out/clinvar.ndjson` for every reviewed human protein.
- `pnpm alphamissense`: downloads AlphaMissense's 1.2 GB
  `AlphaMissense_aa_substitutions.tsv.gz` and writes `out/alphamissense.json`,
  a score for each variant in `out/clinvar.ndjson`.
- `pnpm analyze`: the enrichment, overall, by confidence band and by
  AlphaMissense class, in `out/analysis.json`.
- `pnpm gpcr`: the experimental GPCR–G protein interfaces, as
  `site/jbrowse/gpcr_interfaces.bb`, `gpcr_interface_variants.bb` and
  `site/data/gpcr.json`.
- `pnpm tracks`: `site/jbrowse/config.json`, `interfaces.bb` and
  `interface_variants.bb`.
- `pnpm pages`: `site/data/summary.json`, `genes.json` and
  `genes/<GENE>.json`.
- `pnpm isoforms [workers]`: `site/data/isoforms.json` and
  `isoforms/<GENE>.json`.
- The pipeline is TypeScript in `src/`, run directly by Node with no build
  step. Genome ↔ protein positions come from
  [g2p_mapper](https://github.com/GMOD/g2p_mapper) and sequence alignment from
  [p2s_mapper](https://github.com/GMOD/p2s_mapper), the libraries behind the
  JBrowse protein3d plugin.
- The site is `site/index.html`, `app.js` and `style.css`, also with no build
  step. On push, GitHub Actions unzips JBrowse Web 5.0.0-beta.21 into
  `/jbrowse/` and deploys `site/` to Pages.
- A summary deck is in `slides/`: `make` there builds
  `interface-atlas-summary.pdf` with LuaLaTeX, and `make screenshots` retakes
  its screenshots with headless Chrome.

Requires Node 24 or later, pnpm, and UCSC's `bedToBigBed`.

## Data and credits

- [AlphaFold DB](https://alphafold.ebi.ac.uk/) predicted complexes and isoform
  models (EMBL-EBI, Google DeepMind, NVIDIA, Seoul National University),
  CC-BY 4.0.
- [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) (NCBI) classifications.
- [AlphaMissense](https://zenodo.org/records/10813168) predictions (Google
  DeepMind), CC-BY 4.0.
- [UniProt](https://www.uniprot.org/) (CC-BY 4.0): the disease proteins, their
  isoforms and RefSeq cross-references.
- [EBI Proteins API](https://www.ebi.ac.uk/proteins/api/doc/) protein → genome
  coordinates.
- [RCSB PDB](https://www.rcsb.org/) structures with
  [PDBe](https://www.ebi.ac.uk/pdbe/) SIFTS residue mappings, selected from
  [GPCRdb](https://gpcrdb.org/) by BioHackathon Europe 2026 Project 9.
- hg38 assembly, gene and ClinVar track configuration from
  [jbrowse.org/ucsc/hg38](https://jbrowse.org/ucsc/hg38/config.json); viewer:
  [JBrowse 2](https://jbrowse.org/jb2/) with the protein3d plugin.
