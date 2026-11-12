---
name: explorer-reframe
description: "Reframe the site from a findings paper to an app for exploring disease variants on predicted interfaces, now named Interface explorer. Read before changing the home page, Layout or blog framing."
---

# From atlas of findings to interface explorer

- **Why:** "pathogenic variants concentrate at interfaces" is established
  (Sahni et al. 2015, Interactome INSIDER 2018, David & Sternberg). Leading
  with it invites "duh". What is new is per variant and per partner: which
  partner an uncertain variant may disturb, which of a protein's interactions
  carries its disease, codon-level interface tracks on the genome, isoforms
  that lose an interface, and soon a mechanism hint
  (`handoffs/mechanism-split.md`). The site should present itself as a tool
  for exploring those, with the statistics as evidence that the predicted
  interfaces are worth exploring.
- **State as of 2026-11-12:** renamed to Interface explorer, URL
  `/interface-explorer/`. Home headline done; the other framing changes
  below are not started. Claim a step here before starting it.

## Framing changes

- **Home hero (`web/pages/index.astro`):** headline is "Explore pathogenic
  variants at protein interfaces" (done). Keep the hero light: no gene search
  or other action controls in it, since it overloads easily. Search, if added,
  lives elsewhere (nav or the Genes page).
- **Tiles:** lead with explorable counts (genes, partners, uncertain variants
  with a named partner, leads), not percentages.
- **Blog:** keep the posts, retitled as evidence and worked examples rather
  than headline findings.
- **Gene pages and Leads:** the core of the app already; once the mechanism
  hint exists it belongs in the sentence above the 3D view and as a Leads
  column.
- **README and About:** open with the tool and its questions ("which partner
  might this VUS disturb?"), findings after.

## Rename (done 2026-11-12)

Display name, `base` in `astro.config.mjs`, links in `src/screenshots.ts`,
`src/checkLinks.ts`, README and slides now say Interface explorer and
`/interface-explorer/`. GitHub Pages does not redirect after a repo rename, so
links to `/interface-atlas/` shared before then are dead. Internal names
(`src/atlas.ts`, `out/atlas.json`, `AtlasProtein`) stay: they name the data
step, not the site.

## Working rules

- Worktree branch, fast-forward onto main. Check pages on `astro preview`.
- Run only the tests for files touched while iterating; full suite and
  typecheck once at the end. Repeat this rule in any subagent brief.
