# interface-atlas

**TL;DR:** for every human disease gene, which codons sit at an interface in an
AlphaFold DB predicted complex, which ClinVar missense variants fall there, and
how each alternative isoform's predicted structure differs from the canonical
one.

**Live:** https://cmdcolin.github.io/interface-atlas/

- **Genes:** a searchable table of the 1,331 disease genes with a confident
  predicted partner. Each gene page lists its partners, a protein map and the
  ClinVar variants at an interface. It launches JBrowse on the genome, or a
  variant inside its complex beside the genome with the variant marked.
- **Isoforms:** for disease genes with AlphaFold DB isoform models, where each
  isoform differs from the canonical protein, whether the part they share keeps
  its predicted fold, and which pathogenic sites and partner interfaces it
  lacks. Each isoform opens superposed on the canonical model, linked to its own
  transcript.
- **JBrowse** at `/jbrowse/`, with the two tracks below.

## Tracks

- **Predicted interface codons:** one feature per partner, e.g.
  "GNAO1–GNB2 (ipSAE 0.73)". The codons are those of residues within 5 Å of
  the partner in an AlphaFold DB heterodimer with ipSAE ≥ 0.6 and residue
  pLDDT ≥ 70.
- **ClinVar missense at a predicted interface:** red is pathogenic, orange is
  uncertain significance, grey is benign.
- Both are bigBed. Alongside: NCBI RefSeq genes and UCSC's ClinVar track.

## What we found (all 5,350 UniProt disease proteins)

- 1,344 (25%) have an AlphaFold DB heterodimer; all of AlphaFold DB's
  heterodimers have ipSAE ≥ 0.6, its "tentatively high-confidence" threshold.
- Within each protein, pathogenic missense variants sit at a predicted
  interface 2.4× as often as benign ones (Mantel–Haenszel odds ratio, 95% CI
  2.0–2.8, 906 proteins with both). Counting only folded, surface-exposed
  residues, it is 3.2× (2.7–4.0), so the effect is not just "folded vs
  disordered".
- The signal does not strengthen with confidence: the odds ratio is flat at
  about 2.4 up to ipSAE 0.7 and falls to 2.0 at 0.8 and 1.8 (0.9–4.0) at 0.9.
- 26,588 classified missense variants sit at a confident interface: 2,533
  pathogenic, 23,233 of uncertain significance and 822 benign. Examples:
  VHL's 48 pathogenic variants at the elongin C interface, and GNAO1's at the
  Gβ (L13P, I19M, L23F) and RGS (T182I, Q205P, R206) interfaces.
- 98.8% of those variants' genomic positions fall inside their gene's
  interface codons, an independent check of the residue → codon mapping. The
  rest belong to proteins encoded by several identical genes (histones H3.3
  and H4, calmodulin, α-globin): the codons are drawn on one copy and ClinVar
  names another.

## Isoforms (1,939 of 3,423 disease genes with described isoforms checked so far)

- AlphaFold DB models at least one alternative isoform for 1,885 of them:
  4,460 isoforms. Every rebuilt isoform sequence matches its model.
- 1,300 isoforms lack at least one residue where ClinVar has a pathogenic
  missense variant on the canonical protein.
- 207 isoforms lack half or more of a predicted partner interface. Example:
  APP695 (P05067-4), the neuronal isoform, has no Kunitz inhibitor domain, so it
  lacks most of APP's predicted interfaces with the proteases KLK11, KLK14 and
  prostasin; APP751, which keeps the domain, lacks none of them.
- 129 isoforms drop at least 10 residues they share with the canonical protein
  from confident (pLDDT ≥ 70) to very low (< 50), e.g. PRDM1 isoform 3 and
  MYLK isoform 4.

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
- **Isoforms:** each isoform's sequence is rebuilt from UniProt's
  alternative-sequence edits and must equal its AlphaFold DB model's sequence;
  that gives each isoform residue its canonical position. A replaced stretch
  keeps the residues it shares with the canonical at either end, and one of the
  same length is compared residue by residue.

## Run

- `python3 atlas.py [workers]`: fetches the complexes, models and monomer
  context for every disease protein. Downloads are cached in `data/`; keep
  workers at 3–4, since AlphaFold DB rate-limits.
- `python3 clinvar.py`: downloads ClinVar's `variant_summary.txt.gz` and writes
  `out/clinvar.json`.
- `python3 analyze.py`: the enrichment, in `out/analysis.json`.
- `python3 tracks.py`: `site/jbrowse/config.json`, `interfaces.bb` and
  `interface_variants.bb`.
- `python3 site.py`: `site/data/summary.json`, `genes.json` and
  `genes/<GENE>.json`.
- `python3 isoforms.py [workers]`: `site/data/isoforms.json` and
  `isoforms/<GENE>.json`.
- The site is `site/index.html`, `app.js` and `style.css`, with no build step.
  On push, GitHub Actions unzips JBrowse Web 5.0.0-beta.21 into `/jbrowse/` and
  deploys `site/` to Pages.

Requires Python 3 with numpy, scipy, biopython and requests, and UCSC's
`bedToBigBed`.

## Data and credits

- [AlphaFold DB](https://alphafold.ebi.ac.uk/) predicted complexes and isoform
  models (EMBL-EBI, Google DeepMind, NVIDIA, Seoul National University),
  CC-BY 4.0.
- [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) (NCBI) classifications.
- [UniProt](https://www.uniprot.org/) (CC-BY 4.0): the disease proteins, their
  isoforms and RefSeq cross-references.
- [EBI Proteins API](https://www.ebi.ac.uk/proteins/api/doc/) protein → genome
  coordinates.
- hg38 assembly, gene and ClinVar track configuration from
  [jbrowse.org/ucsc/hg38](https://jbrowse.org/ucsc/hg38/config.json); viewer:
  [JBrowse 2](https://jbrowse.org/jb2/) with the protein3d plugin.
