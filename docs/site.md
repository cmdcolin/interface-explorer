# What's on the site

- **Start page:** what there is to explore (genes, interfaces, uncertain
  variants with a partner, leads), the odds ratio as evidence that the
  interfaces matter, every gene as a dot, and links to the blog.
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

