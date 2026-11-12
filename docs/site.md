# What's on the site

- **Start page:** what there is to explore, and the odds ratio as evidence that
  interfaces matter.
- **Genes:** a searchable table of disease genes with a confident predicted
  partner. Each gene page shows the predicted complex in 3D, its interface
  residues and the ClinVar variants on them (with whether a residue is at its only
  interface or shared, and which partner causes the same disease or one in the
  same OMIM phenotypic series), a protein map with UniProt domains
  and regions, whether IntAct or BioGRID report each pair (with its papers),
  and a JBrowse launch. Hovering links the map and the 3D view,
  and the address holds the view (`?partner=GNB1&residue=23`) so it can be
  shared.
- **Diseases:** every disease ClinVar names for a pathogenic missense variant at
  an interface, matched through MONDO, with a page for each OMIM phenotypic
  series too. Each page lists the genes and variants, and the predicted pairs
  where both proteins cause the disease, which suggests it may arise by breaking
  that interaction from either side.
- **Leads:** variants of uncertain significance that change an interface
  residue where a substitution is already classified pathogenic (ACMG PS1 and
  PM5), ranked by AlphaMissense score; those that sit only on pairs in
  different compartments are marked.
- **Isoforms:** where each AlphaFold DB isoform model differs from the
  canonical protein, and which pathogenic sites and partner interfaces it lacks.
- **Blog:** the findings as charts, the GPCR–G protein complexes from
  BioHackathon Europe 2026 Project 9, SARS-CoV-2 contacts in the PDB, and the
  explorer's tests run on SLC35A2's molecular dynamics switch residues.
- **JBrowse:** the interface and variant [tracks](tracks.md), hosted at
  jbrowse.org.
- **How it works** and **Comparison** with other resources, each linked to its
  paper.
