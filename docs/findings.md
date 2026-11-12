# Findings

Across all 5,350 UniProt disease proteins.

- 1,344 (25%) have an AlphaFold DB heterodimer. AlphaFold DB publishes only
  heterodimers it calls "tentatively high-confidence": ipSAE ≥ 0.6 in both
  directions (the lower of chain A → B and B → A), mean pLDDT ≥ 70 and at most
  10 backbone clashes ([Han et al. 2026](https://research.nvidia.com/labs/dbr/assets/data/manuscripts/afdb.html);
  ipSAE: [Dunbrack 2025](https://doi.org/10.1101/2025.02.10.637595)).
- Within each protein, pathogenic missense variants sit at a predicted
  interface 2.4× as often as benign ones (Mantel–Haenszel odds ratio, 95% CI
  2.0–2.8, 906 proteins with both). This confirms earlier work rather than
  being new: [Burke et al. 2023](https://doi.org/10.1038/s41594-022-00910-8)
  found 2.3-fold on AlphaFold2 models of HuRI and hu.MAP pairs, and
  [Wang et al. 2012](https://doi.org/10.1038/nbt.2106),
  [Sahni et al. 2015](https://doi.org/10.1016/j.cell.2015.04.013) and
  [David & Sternberg 2015](https://doi.org/10.1016/j.jmb.2015.07.004) showed it
  on experimental interfaces and in the lab. The controls below are what this
  adds. Counting only folded, surface-exposed
  residues, it is 3.2× (2.7–4.0), so the effect is not just "folded vs
  disordered".
- Folded residues alone give 1.7× (1.4–2.0): the buried core is rich in
  pathogenic variants and is not an interface, which is why the surface
  comparison is the fair one.
- The signal does not depend on confidence. Against residues at no interface,
  the odds ratio is 2.5 for ipSAE 0.6–0.7, 2.7 for 0.7–0.8, 2.1 for 0.8–0.9
  and 2.4 (1.4–4.8) at 0.9 and above.
- The interface adds little beyond AlphaMissense. Within AlphaMissense's
  evidence bands, as calibrated for clinical use by Bergquist et al. 2025, the
  pathogenic variants sit at an interface 1.7× as often as the benign ones
  among variants it gives pathogenic evidence (PP3, ≥ 0.792; 1.1–2.7, 195
  proteins), 1.3× among those it gives benign evidence (BP4, ≤ 0.169;
  0.9–2.0, 277 proteins) and 1.1× where it is indeterminate (0.8–1.4, 428
  proteins).
- Conservation explains only part of it. Pathogenic variants favour conserved
  bases: of the variants classified pathogenic or benign, 87% are pathogenic in
  the top quarter of 100-way vertebrate phyloP, against 16% in the bottom
  quarter. Comparing variants only within the same quarter takes the odds
  ratio from 2.4× to 1.8× (1.5–2.3) over all residues, and from 3.3× to 2.9×
  (2.2–3.7) on the folded surface.
- The predicted interfaces are more conserved than the rest of the surface.
  Against the same protein's other folded surface residues at no confident
  interface, matched for exposure and pLDDT, the interface is more conserved in
  85% of 3,595 confident complexes, and in 76–88% within each ipSAE band.
- That is not what any patch of surface would show. Ranked among patches of
  its size from the same protein's other folded surface, the interface beats
  the median one in 82% of 2,339 complexes, against 47% for a random patch
  ranked the same way in its place, and 95% of them in 25%, against 8%. Ranked
  only among patches centred within 25 Å of it, it beats the median one in 76%,
  against 45%, so it is not just sitting in a conserved domain. Conservation
  marks most predicted interfaces as functional surface; it cannot vouch for
  the partner, since AlphaFold reads the same alignments.
- 26,588 classified missense variants sit at a confident interface: 2,533
  pathogenic, 23,233 of uncertain significance and 822 benign. Examples:
  VHL's 48 pathogenic variants at the elongin C interface, and GNAO1's at the
  Gβ (L13P, I19M, L23F) and RGS (T182I, Q205P, R206) interfaces.
- AlphaMissense scores 23,068 of the 23,233 uncertain ones and gives 7,968
  (35%) at least supporting evidence of pathogenicity (PP3) and 5,466 (24%)
  evidence of benignity (BP4), against PP3 for 80% of the pathogenic and 10% of
  the benign variants at an interface. Its developers' 0.564 "likely
  pathogenic" cut-off does not reach supporting evidence. It scores each protein without its partner.
- 675 of the uncertain variants, in 245 genes, change an interface residue
  where a substitution is already classified pathogenic (the same amino-acid
  change for 18, ACMG PS1; a different one for 657, PM5); AlphaMissense gives
  442 of them pathogenic evidence. Examples: GNB1 W99R and D118V at the Gα
  interface, HRAS G60R, and BAP1 C91W and C91Y at the ubiquitin interface.
- Conditions can separate by interface. All 14 pathogenic KRAS variants ClinVar
  lists for non-small cell lung carcinoma sit at a RasGAP interface (G12, G13,
  G60, Q61), against 5 of the 9 listed for Noonan syndrome 3.
- The predictions match experiment where it exists. 859 of the 3,657 predicted
  pairs have both proteins in one PDB entry; 827 can be compared, and in 785 of
  those the two touch. The predicted interface covers a median 88% of the
  experimental one, and 83% of the predicted residues the structure resolves
  are in it. For the 170 pairs with no structure deposited by AlphaFold's
  30 September 2021 training cutoff, it is the same: 88% and 81%. The 42 that
  do not touch are subunits of rings and large assemblies (Sm rings, the
  exosome, the spliceosome) that are not neighbours.
- 98.8% of those variants' genomic positions fall inside their gene's
  interface codons, an independent check of the residue → codon mapping. The
  rest belong to proteins encoded by several identical genes (histones H3.3
  and H4, calmodulin, α-globin): the codons are drawn on one copy and ClinVar
  names another.


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

