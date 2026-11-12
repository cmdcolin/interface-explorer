# JBrowse tracks

- **Predicted interface codons:** one feature per partner, e.g.
  "GNAO1–GNB2 (ipSAE 0.73)". The codons are those of residues within 5 Å of
  the partner, or of the other copy, in an AlphaFold DB heterodimer or
  homodimer with ipSAE ≥ 0.6 and residue
  pLDDT ≥ 70.
- **ClinVar missense at a predicted interface:** red is pathogenic, orange is
  uncertain significance, grey is benign.
- **Experimental GPCR–G protein interface codons** and **ClinVar missense at
  an experimental GPCR–G protein interface**: the same, from the PDB complexes
  in the GPCR blog post, one feature per structure and side, e.g. "DRD1–GNAS
  (7JVQ)".
- All are bigBed. Alongside: NCBI RefSeq genes, UCSC's ClinVar track and
  UCSC's phyloP conservation from the 100-way vertebrate alignment.

