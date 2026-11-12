# Method

- **Proteins:** all reviewed human UniProt entries with a disease annotation.
- **Complexes:** AlphaFold DB heterodimers (up to 30 per protein, by ipSAE).
  Interface residues have a heavy atom within 5 Å of the partner and pLDDT
  ≥ 70. Codons come from EBI Proteins API coordinates on the primary hg38
  chromosomes.
- **Variants:** NCBI ClinVar `variant_summary` single-nucleotide missense
  variants classified pathogenic, likely pathogenic, uncertain, likely benign
  or benign; conflicting classifications are left out. Each keeps the condition
  names its submitters gave, apart from "not provided". Each is named on a
  RefSeq transcript. UniProt says which isoform that transcript encodes, and the
  variant is mapped through that isoform to the canonical residue. Transcripts
  UniProt assigns to no isoform are used only when 95% of their variants match
  the canonical sequence, and every variant's wild-type residue must match.
- **Conservation:** phyloP of every coding base from UCSC's 100-way
  vertebrate alignment (multiz100way) bigWig, cached per protein in
  `data/phylop100way/`. A variant takes its base's score; a residue takes the
  mean over its codon. The matched odds ratio pools tables per protein and
  quarter of the scored variants' phyloP, resampling proteins for the
  interval. The interface comparison takes each confident complex's folded,
  exposed interface residues against the protein's folded, exposed residues at
  no confident interface, each residue against those in the same RSA fifth and
  pLDDT band (70–90 or ≥ 90), and needs at least 5 matched interface residues
  and 5 others. Each interface is then ranked among patches of its size: one
  centred on each folded, exposed residue at no confident interface, made of
  the such residues nearest it by residue centre (mean heavy-atom position) in
  the AlphaFold DB monomer model, and scored against the rest of the surface
  without it, as the interface is. The nearby test keeps only patches centred
  within 25 Å of the interface's centre. Chance is measured by ranking a
  random patch the same way, taken out of the surface in the interface's
  place, which needs room for both, so the tests cover fewer complexes.
- **Experimental check:** SIFTS lists the PDB entries holding both proteins of
  a predicted pair. One is compared per pair: among those covering nearly the
  most of both proteins, the one with the fewest chains, leaving out entries of
  more than 60 chains. Residues within 5 Å of the partner in the deposited
  coordinates are the experimental interface; predicted residues the structure
  does not resolve are not counted against the prediction. A chain SIFTS maps
  to another isoform is used when its residues match the canonical sequence at
  their numbers, and left out otherwise. Contacts made only through crystal
  symmetry are missed.
- **SARS-CoV-2:** the viral proteins are UniProt's reviewed entries for taxon
  2697049, and a contact in either replicase polyprotein is named by the mature
  protein (nsp1 … nsp16) whose span holds it, from UniProt's chain features.
  SIFTS gives the entries holding both proteins; up to four per pair are
  measured, fewest chains first, and the entry with the most contacts is kept.
  A chain carrying both sequences is a fusion construct, so both proteins'
  atoms in that entity are left out. The human chain must match its UniProt
  sequence at 90% of its mapped residues, as in the experimental check above.
- **AlphaMissense:** the published pathogenicity of every substitution in the
  canonical proteins, joined to each variant by UniProt accession and change.
  Scores are read as ACMG PP3/BP4 evidence with the ClinGen calibration of
  Bergquist et al. 2025 (Genet Med 27:101402): PP3 supporting from 0.792,
  moderate from 0.906, strong from 0.990; BP4 supporting at 0.169 and below,
  moderate at 0.099 and below. The developers' 0.564 and 0.34 cut-offs do not
  reach supporting evidence and are not used.
- **GPCRs:** PDBe's updated mmCIF gives each atom's UniProt position (SIFTS).
  The receptor chain is GPCRdb's preferred chain, aligned to its UniProt
  sequence where SIFTS does not map it; Gα chains are found by SIFTS gene or
  entity name. Non-human proteins are aligned to the human ortholog; a contact
  residue that differs from the human one is still mapped, and marked. Four
  engineered chimeric Gα chains map to no gene: each is split into segments by
  the human Gα it matches best, favouring the Gα the structure is annotated
  with, so a mini-Gq gives its α5 helix to GNAQ and its scaffold to GNAS. Only
  receptor–Gα contacts are counted, not those with Gβγ. Receptor residues carry
  GPCRdb's generic number (e.g. 3.50x50), or their segment (e.g. ICL3) where it
  has none, taken from GPCRdb's residue table for the human receptor wherever
  its residue matches UniProt's. Where AlphaFold DB pairs the receptor with a
  different Gα than the structure's (Golf for Gs, Gα14 for Gi1), the
  structure's Gα contacts are aligned onto the predicted Gα by sequence before
  the two are compared.
- **Isoforms:** each isoform's sequence is rebuilt from UniProt's
  alternative-sequence edits and must equal its AlphaFold DB model's sequence;
  that gives each isoform residue its canonical position. A replaced stretch
  keeps the residues it shares with the canonical at either end, and one of the
  same length is compared residue by residue.

