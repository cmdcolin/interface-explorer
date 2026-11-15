---
name: ig-collaboration
description: "The Ig-domain collaboration (hackathon, Philippe Youkharibache's group and msa2d): what they asked for, what was built, what was rejected and why, the CD22/CD33 structure inventory, and the open meeting questions. Read before proposing more Ig work or before the monthly meeting."
---

# Ig domains: the collaboration and what the site should not build

## State as of 2026-11-15

The signal-peptide fix is on main (`ab61c25a`). Everything else below was
reviewed and rejected; don't redo without a new reason.

## What the collaborator asked for

Paraphrased from a hackathon channel message, so the framing is theirs:

- Ig-domains and Ig-chains are the system of interest because splicing takes
  whole domains in and out, which makes domains "bricks" rather than arbitrary
  exon edits.
- The mechanism they want investigated is antibody evasion: the epitope
  disappears with the domain. CD33 and CD22 are their two examples.
- "What matters is not going to be a monomer but a multimer and interactions
  with their receptors", including engineered chimeric receptors.
- "A database is not going to be a solution." They want a meeting, not a
  feature. Monthly, second Thursdays.
- Their own track is `msa2d` (private): alignments as tables and hierarchical
  graphs synced with 3D, fold family by fold family — globins, GPCRs, GTPases,
  WD40s, Igs.

## What was built

**Signal peptides are now separated from domain loss** (`src/igDomains.ts`).
The step read `ft_domain` and `ft_var_seq` but not `ft_signal`, so an isoform
whose deletion removed the signal peptide counted as one that "lacks an Ig-like
domain". For cell-surface and secreted receptors those are different events.

- 66 of the 208 domain-losing isoforms, across 42 of the 107 proteins, delete
  into the signal peptide. Verified twice: independently in Python against
  UniProt `ft_signal`, and by the rebuilt pipeline, which agree exactly.
- `ft_signal` is fetched as its own small cache (`uniprot_ig_signals.json`)
  rather than refetching the 28M `uniprot_ig_isoforms.json` with one more
  field. `getJson` keys purely on the file path, so adding a field to an
  existing cache name would have silently served stale data.
- The map marks affected rows with a dagger; the post splits the proteome
  count and says which class each worked example belongs to.
- **Both worked examples are in the flagged class.** CD22's P20273-5 deletes
  from inside the signal peptide (1–19) through domain 1, and CD33m deletes
  from residue 13 with a signal peptide of 1–17. The post previously said exon
  2 skipping gives isoforms that "make no detectable protein and the map can't
  show them" and then drew P20273-5 under the inotuzumab bar as an untested
  escape candidate. It was both classes at once.
- For CD33 the flag does not undercut the clinical story, it fits it: the trial
  result compares patients by how much full-length CD33 they make, so a poorly
  presented isoform and a competing surface decoy both predict the same
  outcome. The post now says the maps cannot separate those two readings.

## Rejected, with reasons

- **Predicted or experimental interfaces for CD22 and CD33 in the atlas.**
  Three independent blockers. (a) Scope: the pipeline gate is
  `cc_disease:*` (`src/uniprot.ts`) and neither gene has a UniProt disease
  annotation — confirmed absent from `genes.json` (1,649) and `isoforms.json`
  (3,302). Admitting them means a two-gene exception outside every statistic on
  the site, or loosening the gate and rerunning everything. (b) Wrong
  interaction type: both are Siglecs whose defining ligand is a sialylated
  glycan, which a 5 Å protein–protein interface model cannot represent; their
  best-characterised protein partners bind phospho-ITIMs on the cytoplasmic
  tail, on the wrong side of the membrane from the epitope story. (c) It would
  not support the multimer claim anyway — that is an assembly question, and a
  low-confidence AF2 heterodimer is worse than nothing because it looks like
  evidence. The post's promise that this was "the next step" has been removed.
- **An epitope-deletion percentage.** Where it is computable it is
  uninformative: the deletions remove whole domains, so HA22 → 100%, m971 → 0%,
  inotuzumab → 0%. The one antibody whose footprint spans the boundary,
  epratuzumab (domains 2 and 3), is precisely the one the cited paper did not
  test, so a number there is an untested resistance prediction about a drug in
  trials. It is also not reproducible at 3.1 Å with four NCS copies, the
  construct is three domains of a seven-domain glycoprotein, and it multiplies
  a transcript annotation by a crystal as if they were the same kind of
  evidence.
- **Ig domains as a contact graph.** This is the collaborator's `msa2d` track,
  Igs included, so duplicating it is the clearest "not our job" on the list.
  It is also hollow: there is no structure of CD22's full ectodomain, so the
  inter-domain edges are unknown, and taking them from an AF2 model is the PAE
  problem this repo already refused once (`handoffs/isoform-interfaces.md`).
  The README's alignment-as-graph idea stays scoped to GPCRs, where GPCRdb/CGN
  numbering and real complex structures exist.
- **An engineered receptor's antibody fragment as a chain in an assembly.**
  No experimental structure exists and modelling the synapse is designing a
  mechanism. The hero image carries it as a cartoon, which is the right
  register for something unobserved: a schematic reads as a schematic, a
  rendered chain reads as data.
- **Proteome-wide Ig expansion** (more counts, a sortable Ig index, more fold
  families). This is the "database" the collaborator says is not the solution,
  and the fold-family sweep is their roadmap. Note the direction of travel:
  the fix above means 208 was overstated as brick-removal, so the count wanted
  narrowing, not growing.
- **Splice-region variants that change isoform choice.** rs12459419 is the one
  place Ig touches the site's big story — a variant whose effect is to change
  which isoform is made. But generalising it needs a new variant class (the
  codon machinery is built for missense), duplicates SpliceAI, and lands in the
  rejected general-variant-browser territory. One mention in one post is right.

## Facts worth keeping

**CD22/CD33 antibody-bound structures** (RCSB, 2026-11-15). Useful if the
epitope question ever returns, and useful in the meeting because the
collaborator's own sessions contain no antibody at all.

- CD22 (P20273), 7 entries. With Fabs: **5VL3** (3.1 Å, epratuzumab, CD22
  d1–d3, four copies, CD22 chains covering UniProt 22–330 with author
  numbering equal to UniProt numbering) and **7O52** (2.41 Å, m971, d6–d7,
  504–687). Note 7O52's construct spans domains 6 *and* 7, so the post's
  hand-typed "m971 binds domain 7" is worth checking against computed contacts
  if anyone revisits — that label carries the post's central caveat.
- CD33 (P20138), 11 entries. With Fabs: **9MKG** (cryo-EM 3.45 Å, 15G15.3) and
  **9VL2** (3.18 Å, 10C8). **Neither is gemtuzumab or P67.6**, so CD33's
  clinically relevant antibodies have no public structure. Any structural Ig
  demo is a CD22 demo.

**Their iCn3D share links decode.** `share2.html?<key>&t=<acc>` is a
client-side redirector to `https://icn3d.link/?shorturl=<key>`, which 302s to a
full URL with the whole viewer state in a `command` parameter. Both of their
links load the **AlphaFold** model (`mmdbafid=`), CDD annotations, and an exon
track on the structure (`add exon track | geneid 945` for CD33, `933` for
CD22). Monomers, `bu=1`, no antibody.

- The CD22 link carries `select .A:1-329 or .A:418-847`, i.e. everything except
  330–417. That is **not CD22-alpha**. P20273-2 (CD22-alpha) deletes 241–417
  and loses domains 3 and 4; the isoform matching their selection to the
  residue is **P20273-3**, which deletes 330–417 and loses domain 4 only. Our
  post and the Zheng 2022 CAR-resistance literature are about CD22-alpha.
  **Ask which they mean** — none of the three antibodies in the post is placed
  on domain 4, so if the domain-4 isoform is their real interest the antibody
  story is a different one.

**The complementarity, concretely.** They have exon boundaries painted onto 3D
structure in a viewer, one protein at a time, hand-selected. We have
exon/isoform → domain → interface → variant computed across the proteome, but
flat. Neither is the other's database.

## Open questions for the meeting

- Which CD22 isoform do they actually mean, P20273-2 or P20273-3? (See above.)
- Do they want our Ig domain/isoform table emitted in a format `msa2d` can
  read, so it lands in their viewer rather than ours? That needs repo access;
  they were inviting GitHub usernames.
- "When/why AS isoforms get in or out of action" is their stated real question.
  It needs RNA-seq, splicing QTLs and leukaemia cohort data — it is
  unanswerable from structure and acquiring that data would be a second site.
  Say so rather than building toward it.

## Caution on reviews

The 2026-11-15 review that produced most of this was right on substance and
wrong on one number (it claimed 75 isoforms cut into residues 10–20; the real
count for 6–20 is 23, and the defensible measure is signal-peptide overlap,
66). Recompute any figure a review hands you before it reaches prose. A Fable
review of the same brief was refused by that model's safeguards as biosecurity
risk, twice in the same session, which is worth knowing before budgeting time
for one: the therapy-resistance framing is what trips it.
