# Where GPCRs meet their G proteins

From 24 experimental complexes.

- The structures are a GPCRdb selection of dopamine, serotonin, adrenergic and
  histamine receptors made by BioHackathon Europe 2026 Project 9
  (`gpcr_structures.tsv`, `dataset` DataSet1): 23 with a G protein bound, 22
  without. One more is added to test the olfactory receptor predictions:
  OR51E2 with propionate and mini-Gs (8F76, Billesbølle et al. 2023).
- AlphaFold DB's OR51E2–Golf complex covers 86% of the receptor residues
  OR51E2 uses against mini-Gs, and 94% of the residues it predicts are among
  them, though its ipSAE is only 0.63.
- On the Gα side, mapped onto Golf by sequence (80% identical to Gαs), the
  same complex predicts 23 residues, all among the 24 mini-Gs uses; it misses
  only K376 (Gαs R389). Golf's VUS L380R sits on that shared surface; the
  dystonia variant D227N does not (its Gαs counterpart is 11.6 Å from
  OR51E2). Golf's complexes with OR2A1, OR2J3 and OR2L13 cover 79–88% of the
  same surface.
- Gαs has no AlphaFold DB complex with a GPCR, but 9 experimental Gs complexes
  and the Gαs scaffold of 4 engineered chimeras put 47 of its residues against
  a receptor. 10 ClinVar pathogenic variants sit on them, most on the
  C-terminal α5 helix: R342Q, R347T, G353R, F376V, C379Y, D381V, Q384E, R385H,
  L388R and E392K.
- Where AlphaFold DB has a comparable prediction, it finds the experimental
  surface: its GPCR complexes of Gαi1 cover 90% of the residues the 10
  experimental Gi1 complexes use (68% of its residues are among them), its
  RHO–Gαo complex covers 88% of 5-HT1B–Gαo's, and its DRD5–Golf complex covers
  87% of the receptor residues DRD5 uses against Gs. Its GPCR complexes of Gαq
  cover all 11 α5 residues the three mini-Gq chimeras contain.
- Every receptor is looked up in AlphaFold DB, disease protein or not. Only
  DRD5 and OR51E2 (with Golf) and HRH4 (with Gα14, covering 66% of the residues
  HRH4 uses against Gi1) have a predicted complex with a Gα.
- On the receptor side, 82 ClinVar variants of uncertain significance and 2
  benign ones contact the G protein; none is classified pathogenic. Every
  receptor contact is labelled with its GPCRdb generic number, and every Gα
  contact with its common Gα numbering (CGN; Flock et al., Nature 2015), also
  from GPCRdb. CGN gives the same label to equivalent positions in every Gα,
  so the Gαs and Gαolf counterparts quoted in the post (L380 and L393 are both
  G.H5.25) are read from it rather than from a sequence alignment.

