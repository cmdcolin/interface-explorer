# interface-atlas

**TL;DR:** genome-browser tracks showing which codons of a human gene sit at
an interface in an AlphaFold DB predicted complex, and which ClinVar missense
variants fall there. This is a prototype on 150 random human disease proteins.

**Live:** https://cmdcolin.github.io/interface-atlas/: a searchable gene
table, a page per gene (partners, a protein map and its interface variants),
and launches into JBrowse at `/jbrowse/`.

## Tracks

- **Predicted interface codons:** one feature per partner protein, e.g.
  "GNAO1–GNB2 (ipSAE 0.73)". The codons are those of residues within 5 Å of
  the partner in an AlphaFold DB heterodimer with ipSAE ≥ 0.6 and residue
  pLDDT ≥ 70.
- **ClinVar missense at a predicted interface:** red is pathogenic, orange is
  uncertain significance, grey is benign.
- Alongside: NCBI RefSeq genes and UCSC's ClinVar track. The protein3d plugin
  opens the complex in 3D.

## What we found (150 random disease proteins)

- Pathogenic missense variants sit at predicted interfaces 2.4× as often as
  benign ones, comparing within each protein (Mantel–Haenszel odds ratio, 95%
  CI 1.3–4.7). Counting only ordered, surface-exposed residues, the ratio is
  4.7× (2.0–15).
- 563 classified missense variants sit at confident interfaces, including
  409 of uncertain significance.
- 561 of the 563 ClinVar genomic positions fall inside their protein's
  interface codons. This is an independent check of the residue → codon
  mapping.

## Caveats

- Only 27% of the sampled proteins have any predicted partner. AlphaFold DB
  modelled STRING physical-interaction pairs only; TP53 has none, and KRAS
  has no RAF.
- The complexes are predictions (AlphaFold-Multimer). The AlphaFold DB team
  calls ipSAE ≥ 0.6 "tentatively high-confidence".
- This is a sample of 150 proteins, not the whole proteome.

## Run

- `python3 atlas.py`: samples the proteins and fetches complexes, models and
  ClinVar variants. Downloads are cached in `data/`.
- `python3 analyze.py`: computes the enrichment and writes
  `out/analysis.json`.
- `python3 tracks.py`: writes the JBrowse files `site/jbrowse/config.json`,
  `interfaces.bed` and `interface_variants.bed`.
- `python3 site.py`: writes the website's data, `site/data/summary.json`,
  `genes.json` and one `genes/<GENE>.json` per gene. The site itself is
  `site/index.html`, `app.js` and `style.css`, with no build step.
- On push, GitHub Actions unzips JBrowse Web 5.0.0-beta.21 into `/jbrowse/`
  and deploys `site/` to Pages.

Requires Python 3 with numpy, scipy, biopython and requests.

## Data and credits

- [AlphaFold DB](https://alphafold.ebi.ac.uk/) predicted complexes (EMBL-EBI,
  Google DeepMind, NVIDIA, Seoul National University), CC-BY 4.0.
- [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) classifications, via the
  [EBI Proteins API](https://www.ebi.ac.uk/proteins/api/doc/), which also
  supplies the protein → genome coordinates.
- [UniProt](https://www.uniprot.org/) (CC-BY 4.0) for the protein sample.
- hg38 assembly, gene and ClinVar track configuration from
  [jbrowse.org/ucsc/hg38](https://jbrowse.org/ucsc/hg38/config.json); viewer:
  [JBrowse 2](https://jbrowse.org/jb2/).
