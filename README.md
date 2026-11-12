# interface-explorer

**TL;DR:** for every human disease gene, which codons sit at an interface in an
AlphaFold DB predicted complex, which ClinVar missense variants fall there, and
how each alternative isoform's predicted structure differs from the canonical
one.

**Live:** https://cmdcolin.github.io/interface-explorer/

- **Start page:** the headline share of variants at an interface, a gene
  search, every gene as a dot, and links to the blog.
- **Blog:** the findings as charts (the pathogenic-versus-benign odds ratio
  under each control, by confidence band and within each calibrated
  AlphaMissense evidence band, and how many variants at an interface reach
  AlphaMissense's pathogenic evidence); how conservation
  across 100 vertebrates bears on it; three worked examples (VHL, GNAO1,
  APP695); and the receptor–G protein complexes BioHackathon Europe 2026
  Project 9 selected, in 3D, where every pathogenic variant at the interface is
  on the G protein, with each complex's contacts and GPCRdb numbers, and
  AlphaFold DB's Gαolf–olfactory receptor complexes checked on both sides
  against OR51E2's structure; and which human disease proteins a SARS-CoV-2
  protein actually touches in the PDB, with the ClinVar variants on the
  contact.
- **Genes:** a searchable table of the 1,331 disease genes with a confident
  predicted partner. Each gene page opens on its predicted complex in 3D,
  starting with the partner whose interface carries the most pathogenic
  variants, preferring one that an experimental structure confirms over one no
  structure covers, and either over one a structure contradicts. The page's protein is grey, the partner green under a translucent
  surface, and its interface residues blue; the ClinVar variants on them are
  coloured by classification. A sentence above the 3D view gives each partner's
  counts, the PDB entry that confirms it (or a warning when the experiment shows
  a different interface, for 111 partners), and any UniProt region annotated as
  binding there. Partners touching nearly the same residues share one button,
  as they share a map row. Below it, a protein map shows the variants, UniProt domains
  and regions, and a row per partner. Hovering the map or a variant row marks
  the residue in 3D, hovering in 3D marks it on the map, and clicking zooms to
  it. The address then holds the view (`?partner=GNB1&residue=23`), so it can be
  shared. When the partner is a disease protein too, its side of the interface
  and its variants are painted the same way, and the sentence links to its page;
  1,422 of the partner views have such a side. The partners table gives how
  conserved each interface is across 100 vertebrates: the share of same-size
  patches on the rest of the protein's surface it beats. The page lists the
  ClinVar variants at an interface, each with its AlphaMissense score and the
  phyloP of its base, and they can be narrowed to one ClinVar condition. It
  also launches JBrowse on the genome, with the phyloP track under the
  interface and ClinVar tracks, or a variant inside its complex beside the
  genome with the variant marked.
- **Leads:** the 675 variants of uncertain significance that change an
  interface residue where a substitution is already classified pathogenic,
  split into the 18 with the same amino-acid change (ACMG PS1) and the rest
  (PM5), ranked by AlphaMissense score, with the phyloP of each changed base.
  Each opens on its gene page in 3D,
  zoomed to the residue.
- **Isoforms:** for disease genes with AlphaFold DB isoform models, where each
  isoform differs from the canonical protein, whether the part they share keeps
  its predicted fold, and which pathogenic sites and partner interfaces it
  lacks. Each isoform opens superposed on the canonical model, linked to its own
  transcript.
- **JBrowse**, hosted at jbrowse.org on the explorer's config, with the tracks
  below.
- **How it works:** a diagram of the data sources, the pipeline scripts and the
  libraries they use (`g2p_mapper`, `p2s_mapper`, `@gmod/bbi`), and the viewers.
- **Comparison:** how the explorer sits among other resources for disease
  variants at protein interfaces (Interactome INSIDER, Burke et al. 2023,
  Jänes et al. 2024 and ProtVar, PIONEER, Genomics 2 Proteins and others), what
  it confirms and what it adds, each linked to its paper.

## Tracks

- **Predicted interface codons:** one feature per partner, e.g.
  "GNAO1–GNB2 (ipSAE 0.73)". The codons are those of residues within 5 Å of
  the partner in an AlphaFold DB heterodimer with ipSAE ≥ 0.6 and residue
  pLDDT ≥ 70.
- **ClinVar missense at a predicted interface:** red is pathogenic, orange is
  uncertain significance, grey is benign.
- **Experimental GPCR–G protein interface codons** and **ClinVar missense at
  an experimental GPCR–G protein interface**: the same, from the PDB complexes
  in the GPCR blog post, one feature per structure and side, e.g. "DRD1–GNAS
  (7JVQ)".
- All are bigBed. Alongside: NCBI RefSeq genes, UCSC's ClinVar track and
  UCSC's phyloP conservation from the 100-way vertebrate alignment.

## What we found (all 5,350 UniProt disease proteins)

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
  pathogenic" cut-off does not reach supporting evidence. It sees one protein at a time, not the partner.
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

## GPCRs and their G proteins (24 experimental complexes)

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
  cover all 11 α5 residues the three mini-Gq chimeras carry.
- Every receptor is looked up in AlphaFold DB, disease protein or not. Only
  DRD5 and OR51E2 (with Golf) and HRH4 (with Gα14, covering 66% of the residues
  HRH4 uses against Gi1) have a predicted complex with a Gα.
- On the receptor side, 82 ClinVar variants of uncertain significance and 2
  benign ones contact the G protein; none is classified pathogenic. Every
  receptor contact carries its GPCRdb generic number.

## SARS-CoV-2 contacts (13 experimental complexes)

- AlphaFold DB's complexes are human–human, so the virus enters only through
  the PDB. 51 disease proteins share an entry with one of the 17 reviewed
  SARS-CoV-2 proteins; in 13 of those 54 pairs the two actually touch, over 12
  genes, and 11 carry a classified ClinVar missense variant on the contact: 5
  pathogenic, 28 uncertain and 11 benign.
- ISG15 gives the largest contact: 34 residues against the papain-like protease
  (7RBS), carrying 12 variants reported for ISG15 deficiency.
- Pathogenic variants on a contact are NEMO's L227P, in the 10-residue stretch
  of IKBKG that sits in the main protease's cleft (7T2U), and 14-3-3ζ's K49N,
  R127C, R127H and E180K, in the YWHAZ groove that holds the nucleoprotein's
  phosphopeptide (7ZIT).
- The three main-protease substrate complexes (NEMO, PTBP1, TRMT1) share 27
  protease residues, the cleft around the catalytic H41 and C145: the same site
  read from three independent entries.
- The expected pairs that do not touch: none of the 25 ribosomal disease
  proteins in the nsp1 entries touches nsp1, which holds RPS2, RPS3 and FAU
  around the 40S mRNA channel; SLC6A19 and SLC6A20 are in the spike entries
  bound to ACE2, not to spike; B2M is in the MHC entries while HLA-B holds the
  epitope.
- Three human proteins touch a viral protein only as a structural reagent
  (APOA1 and PSAP as nanodisc scaffolds, COL18A1 as a trimerisation domain),
  and ETV6's entries are crystallisation fusions, one chain carrying both
  sequences. Neither counts as a contact.

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
  AlphaMissense evidence band, in `out/analysis.json`.
- `pnpm experimental [workers]`: each predicted pair against a PDB entry
  holding both proteins, in `out/experimental.json`.
- `pnpm conservation [workers]`: reads phyloP for every codon from UCSC's
  bigWig by range requests, and writes the conservation-matched odds ratios
  and the interface comparison to `out/conservation.json`.
- `pnpm gpcr`: the experimental GPCR–G protein interfaces, as
  `site/jbrowse/gpcr_interfaces.bb`, `gpcr_interface_variants.bb` and
  `site/data/gpcr.json`.
- `pnpm viral [workers]`: the SARS-CoV-2 contacts, in `out/viral.json` and
  `site/data/viral.json`.
- `pnpm tracks`: `site/jbrowse/config.json`, `interfaces.bb` and
  `interface_variants.bb`.
- `pnpm pages`: `site/data/summary.json`, `genes.json`, `leads.json` and
  `genes/<GENE>.json`, with each disease protein's UniProt domains and regions
  (one UniProt download, cached in `data/uniprot_disease_features.json`) and
  which chain of each AlphaFold DB complex is the gene's.
- `pnpm isoforms [workers]`: `site/data/isoforms.json` and
  `isoforms/<GENE>.json`.
- The pipeline is TypeScript in `src/`, run directly by Node with no build
  step. Genome ↔ protein positions come from
  [g2p_mapper](https://github.com/GMOD/g2p_mapper) and sequence alignment from
  [p2s_mapper](https://github.com/GMOD/p2s_mapper), the libraries behind the
  JBrowse protein3d plugin.
- The site is an [Astro](https://astro.build/) site in `web/`, prebuilt from
  the JSON in `site/data/`: a page per gene and per isoform set, and Markdown
  (MDX) blog posts in `web/content/blog/` whose numbers and charts are drawn
  from the same data. `site/` is its public folder, so the data and JBrowse
  tracks are served as they are. `pnpm dev` serves it, `pnpm build` writes
  `dist/`. The JBrowse session links are built in `src/links.ts`, shared with
  the pipeline. They open the hosted JBrowse at
  [jbrowse.org/code/jb2/main](https://jbrowse.org/code/jb2/main/) with
  `?config=` pointing at the deployed `jbrowse/config.json`, whose tracks it
  reads across origins from Pages. On push, GitHub Actions builds and deploys
  `dist/` to Pages. Links from the old single-page site (`#/gene/VHL`) redirect to the
  new pages.
- The 3D view is the [Mol\*](https://molstar.org/) v6 Prism viewer, not yet on
  npm: `site/prism/prism-viewer.js` is its single-file build
  (`apps/prism-viewer/build/prism-viewer.js` after `pnpm build:apps`) from
  molstar `master` at dabbf29f9. Each gene page loads it on demand, writes a
  MolViewSpec for the chosen complex in `web/lib/scene.ts`, and reads the
  complex from AlphaFold DB.
- A summary deck is in `slides/`: `make` there builds
  `interface-explorer-summary.pdf` with LuaLaTeX, and `make screenshots` retakes
  its screenshots with headless Chrome.

Requires Node 24 or later, pnpm, and UCSC's `bedToBigBed`.

## Data and credits

- [AlphaFold DB](https://alphafold.ebi.ac.uk/) predicted complexes and isoform
  models (EMBL-EBI, Google DeepMind, NVIDIA, Seoul National University),
  CC-BY 4.0.
- [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) (NCBI) classifications.
- [AlphaMissense](https://zenodo.org/records/10813168) predictions (Google
  DeepMind), CC-BY 4.0.
- [UCSC Genome Browser](https://genome.ucsc.edu/) phyloP scores from the
  100-way vertebrate alignment (multiz100way).
- [UniProt](https://www.uniprot.org/) (CC-BY 4.0): the disease proteins, their
  isoforms, domains and regions, and RefSeq cross-references.
- [Mol\*](https://molstar.org/) (MIT): the 3D view.
- [EBI Proteins API](https://www.ebi.ac.uk/proteins/api/doc/) protein → genome
  coordinates.
- [RCSB PDB](https://www.rcsb.org/) structures with
  [PDBe](https://www.ebi.ac.uk/pdbe/) SIFTS residue mappings, selected from
  [GPCRdb](https://gpcrdb.org/) by BioHackathon Europe 2026 Project 9.
- hg38 assembly, gene and ClinVar track configuration from
  [jbrowse.org/ucsc/hg38](https://jbrowse.org/ucsc/hg38/config.json); viewer:
  [JBrowse 2](https://jbrowse.org/jb2/) with the protein3d plugin.
