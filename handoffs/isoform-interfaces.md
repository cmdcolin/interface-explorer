---
name: isoform-interfaces
description: "Isoform pages and the isoforms post: how interfaces and ClinVar pathogenic sites are drawn and described, what was decided against (monomer 3D distance), and the open next steps. Read before touching isoformMap, pathogenicSites or src/isoforms.ts summary rows."
---

# Isoform pages: interfaces and pathogenic sites

## State as of 2026-11-13

All of this is on main (`c16e8e17`, `9d9d05a0`, `45b728cd`, `0b79c4d4`,
`f032b15a`).

- **Map (`isoformMap` in `web/lib/maps.ts`):**
  - A ClinVar pathogenic row sits above the isoforms, then one row per partner,
    with the interface drawn as blocks: residues up to `BRIDGE` (4) apart are
    joined.
  - Partners whose interfaces overlap by at least `ALIKE` (0.8, Jaccard) share
    a row and a circle column, through the `alikeGroups` helper that the gene
    page's `partnerGroups` also uses. The protein's own copy (homodimer, shown
    as "itself") never groups.
  - Each circle is the share of the group's union of interface residues present
    in the isoform, computed from `segments`, no longer from the pipeline's
    `interfaceLost`.
  - Hover is keyed by `group:N`. `data-members` carries the `partner:X` keys, so
    table hover-hints light the group. `web/scripts/guides.ts` now also matches
    guide paths by `data-members`, which the gene page benefits from too.
- **Page sentence (`pathogenicSites` in `web/lib/maps.ts`, rendered in
  `web/pages/isoforms/[page].astro`):**
  - With no pathogenic site at an interface, it says where the sites and the
    interfaces lie, and how many sites the canonical model has below pLDDT 50.
  - Otherwise it lists each site with its partners, or counts per partner when
    there are more than 5 sites.
- **Pipeline (`summaryRow` / `isoformTotals` in `src/isoforms.ts`):**
  - Adds `pathogenicAtInterface` and `pathogenicInterfaceLost` per gene. The
    second is the most pathogenic interface sites any one isoform lacks.
  - Adds `genesPathogenicAtInterface` and `genesLackingPathogenicInterface` to
    the totals.
  - The isoforms index has a sortable column for each, and the post's "Across
    the disease genes" paragraph quotes both totals.
- **APP in the post:** a computed sentence (`appSites` in `web/lib/cases.ts`)
  says that its pathogenic sites (Aβ/TM region) are not in the Kunitz-domain
  interfaces, so the example is about interface loss only.
- **Rerunning the index and totals** needs no network once caches exist:
  `OUT_DIR=<main checkout>/out node src/isoforms.ts 8`. Run it from a worktree
  with `data` and `node_modules` symlinked. It only reads `out/`. A clean rerun
  changes only `site/data/isoforms.json` and `site/data/isoformTotals.json`.

## Decided against

- **3D distance in the monomer from pathogenic sites to the interface:**
  reviewed and dropped.
  - APP's sites are mostly pLDDT < 50, and the domain placement depends on PAE.
  - The interfaces come from complex models, not the monomer.
  - An Å number invites a proximity story, which the site avoids.
- **Pooled sequence distance ("closest is N residues along the sequence"):**
  replaced, because it named neither the site nor the partner and only restated
  the gap the map already shows.
- **Second-shell distance in the complex model:** sent to the
  interface-atlas-8d session, which passed on it for now because it doesn't
  clarify the main story. The sound version is in "Next steps" if revisited.

## Next steps

- **A second worked example in the isoforms post:** an isoform that lacks a
  pathogenic site that is also an interface residue (the case APP doesn't
  show). Sort the index by "Pathogenic interface sites absent". Top candidates
  on 2026-11-13 were ALPL, EDA, MLH1, CDKN2A, PLA2G6 and CTLA4.
  - Many of these, such as ALPL and GALT, are homodimer ("itself") interfaces.
    Say so, or prefer a hetero partner.
  - Check the biology before writing. CDKN2A's isoforms include the alternative
    reading frame (p14ARF), so "replaced" there is a different protein.
  - Keep it to plain browsing (`explorer-not-findings`), and compute every
    number at build (`no-hand-typed-numbers`).
- **Make the partner sentence follow the groups:** on pages with many partners
  (GNB1, the tubulins) it still lists each partner separately. Per-member
  counts differ slightly within a group, so it needs a rule: union of the
  group's sites, or the maximum.
- **Check the hover in a browser:**
  - group row, column and table hover-hint all light the same group;
  - a single partner's guide draws as blocks.
  - Only static screenshots and HTML were checked.
- **Gene page partner map:** it still draws per-residue ticks inside rows; its
  guide already uses exact blocks via `blocks(…)`. Consider the same `BRIDGE`
  blocks there for consistency.
- **If 3D proximity is ever wanted:**
  - Use the complex model's coordinates (`data/cif`).
  - Report a distance only when both residues have pLDDT ≥ 70 and the
    inter-residue PAE is low, otherwise nothing.
  - It needs the PAE files cached, which the pipeline doesn't do today.
