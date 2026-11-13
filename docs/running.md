# Running the pipeline and site

- `pnpm install`, then `pnpm all` runs every step below in order; `pnpm test`
  runs the unit tests and `pnpm typecheck` the type check.
- `pnpm atlas [workers]`: fetches the complexes, models and monomer context for
  every disease protein, into `out/atlas.json`. Downloads are cached in
  `data/`; keep workers at 3–4, since AlphaFold DB rate-limits. Proteins that
  fail are listed in `out/atlas_failures.json`.
- `pnpm clinvar`: downloads ClinVar's `variant_summary.txt.gz` and writes
  `out/clinvar.ndjson` for every reviewed human protein, with each variant's
  condition names and their MONDO and OMIM identifiers.
- `pnpm alphamissense`: downloads AlphaMissense's 1.2 GB
  `AlphaMissense_aa_substitutions.tsv.gz` and writes `out/alphamissense.json`,
  a score for each variant in `out/clinvar.ndjson`.
- `pnpm interactions`: downloads IntAct's full MITAB, BioGRID's organism
  release and the PSI-MI ontology, and writes `out/interactions.json`: each
  predicted pair either database reports, as direct or same-complex, with its
  publications and methods.
- `pnpm crossrefs`: downloads Complex Portal's human complexes and maps each
  protein to its STRING ID, into `out/crossrefs.json`, for the gene pages'
  links to each pair in IntAct, STRING and Complex Portal.
- `pnpm analyze`: the enrichment, overall, by confidence band, by
  AlphaMissense evidence band and by the pair's reported evidence, in
  `out/analysis.json`.
- `pnpm experimental [workers]`: each predicted pair against a PDB entry
  holding both proteins, in `out/experimental.json`.
- `pnpm conservation [workers]`: reads phyloP for every codon from UCSC's
  bigWig by range requests, and writes the conservation-matched odds ratios
  and the interface comparison to `out/conservation.json`.
- `pnpm gnomad [workers]`: reads gnomAD v4.1 exome variants for every codon
  from UCSC's bigBed by range requests, and writes the missense-to-synonymous
  odds ratios, interface against other surface, to `out/gnomad.json`.
- `pnpm gpcr`: the experimental GPCR–G protein interfaces, as
  `site/jbrowse/gpcr_interfaces.bb`, `gpcr_interface_variants.bb` and
  `site/data/gpcr.json`.
- `pnpm viral [workers]`: the SARS-CoV-2 contacts, in `out/viral.json` and
  `site/data/viral.json`.
- `pnpm md`: SLC35A2's molecular dynamics switch residues, from StarMD's
  ranking in `slc35a2_switches.tsv`, tested against phyloP, AlphaMissense and
  ClinVar, in `out/md.json` and `site/data/md.json`.
- `pnpm tracks`: `site/jbrowse/config.json`, `interfaces.bb` and
  `interface_variants.bb`.
- `pnpm pages`: `site/data/summary.json`, `genes.json`, `leads.json`,
  `genes/<GENE>.json`, `diseases.json` and `diseases/<MONDO_ID>.json`, with
  each disease protein's UniProt domains and regions (cached in
  `data/uniprot_disease_features.json`), each protein's UniProt diseases
  (cached in `data/uniprot_human_diseases.json`), the MONDO ontology (cached in
  `data/mondo.obo.gz`) and which chain of each AlphaFold DB complex is the
  gene's.
- `pnpm mechanism`: labels each gene by its pathogenic truncating variants in
  ClinVar and its ClinGen haploinsufficiency score, and each disease by its HPO
  inheritance mode, into `out/mechanism.json` for `pnpm analyze`.
- `pnpm findings`: regenerates `docs/findings.md` from `site/data/summary.json`,
  `out/gnomad.json` and the interface tracks, so its numbers never go stale.
- `pnpm figures`: draws the blog's charts with ggplot2 from
  `site/data/summary.json` into `site/figures/` (needs R with ggplot2 and
  jsonlite).
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

Requires Node 24 or later, pnpm, `unzip`, and UCSC's `bedToBigBed`.

