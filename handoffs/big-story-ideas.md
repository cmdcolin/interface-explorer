---
name: big-story-ideas
description: "Ideas left after the 2026-11-13 'where variants sit' work, which were rejected and why, and the bar for adding anything. Read before proposing a new feature or analysis."
---

# Ideas after "where variants sit"

## The bar

- The owner wants only features that make the big story clearer to a visitor
  such as a clinician, variant curator or biologist. They don't want to "just
  flail adding more and more crazy things".
- Before building, get a skeptical subagent review that sees the site, not
  your conclusion, and is allowed to answer "none". Two reviews on 2026-11-13
  cut a five-item list to two small changes.

## The big story as the site tells it (2026-11-13)

- Most pathogenic missense in disease proteins with a predicted complex is in
  the buried core, not at an interface. The homepage, the variants post, the
  findings and each gene page's lede now say so, all from `byRegion` /
  `pathogenicByRegion`.
- Within a protein, pathogenic variants still sit at a predicted interface
  more often than benign ones. That is a known result (Sahni 2015, Burke 2023),
  shown here with controls.
- What the explorer offers that others don't: the named partner for each
  variant, the 2026 AlphaFold DB complexes including homodimers, a check
  against the PDB, and how each isoform keeps or loses a partner's interface,
  on the genome.

## Ideas, in order

- **Fresh outside review once the Fable limit resets (Nov 18, 3am ET).** Ask a
  reviewer who hasn't seen this work to read the homepage, one gene page (PAH,
  VHL) and the variants post as a newcomer would. Ask what the site claims and
  where it confuses. An earlier Fable review stopped on the rate limit; its
  transcript is gone with that session, so start fresh.
- **Isoforms as the second headline.** The homepage has a tile now. If the
  isoform session's pages settle, consider one homepage sentence on isoforms,
  generated from `isoformTotals`, beside the "most pathogenic variants are not
  at an interface" paragraph. Ask a reviewer first; the page is already long.
- **Full production build and link check.** The 2026-11-13 changes were checked
  on the dev server only. Run `pnpm build && pnpm check-links` before the next
  deploy.
- **Per-gene ProtVar deep link.** The gene lede links ProtVar's home page.
  Change it to a deep link to the protein only if ProtVar has a stable URL for
  that (check it; don't guess the URL format).

## Rejected, with reasons (don't redo without a new reason)

- **PDB biological-assembly contacts for surface variants** (prototyped, then
  dropped). It duplicates PDBe PISA. Crystal contacts, antibody or helper
  chains, entry choice and circular evidence would make the result misleading.
  The findings point to PISA instead.
- **Listing every ClinVar variant on gene pages.** It would turn the site into
  a general variant browser that duplicates ProtVar and G2P, and make the
  gene-page data several times larger. The lede's region split gives the
  story in one sentence.
- **Joining ProtVar FoldX ΔΔG.** A large download that duplicates ProtVar and
  pulls toward mechanism claims. The site links ProtVar instead.
- **Splitting the surface odds ratio by accessibility bins.** Visitors wouldn't
  notice; the surface-only control already answers the question. Do it only if
  an outside reviewer asks.
- **A gated "second shell" distance from pathogenic sites to interfaces,**
  proposed by the isoform session. It would add a category to explain without
  clarifying the main point, and it needs PAE files the pipeline doesn't
  cache.
- **A mechanism hint per variant from inheritance or truncation class.** See
  `handoffs/mechanism-split.md`: the split is flat on the folded surface.

## Working rules

- Numbers in prose come from the pipeline (`src/findings.ts`, MDX reading
  `summary.json`), never typed by hand.
- Worktree under `.claude/worktrees/`, private `OUT_DIR`, fast-forward onto
  main, and copy back to the shared `out/` only the files you regenerated.
- Run only the tests for the files you touched while iterating; run the full
  suite and typecheck once at the end. Repeat this rule in any subagent brief.
