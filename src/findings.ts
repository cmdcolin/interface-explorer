import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Enrichment, Summary } from '../web/lib/types.ts'
import { ALPHAMISSENSE_LIKELY_PATHOGENIC } from './constants.ts'
import type { Inheritance } from './mechanism.ts'
import type { GenePage } from './pages.ts'
import { OUT, ROOT, SITE_DATA } from './paths.ts'

const FINDINGS = join(ROOT, 'docs', 'findings.md')
const ODDS = 'Mantel–Haenszel odds ratio'
const INTERVAL = '95% CI (bootstrap over proteins)'
const SURFACE = 'ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)'
const ALL = 'all residues'

interface GnomadRow {
  proteins: number
  'missense / synonymous at interface': string
  'missense / synonymous at other surface': string
  [ODDS]: number
  [INTERVAL]: [number, number]
}

interface GnomadResult {
  all: GnomadRow
  byConfidenceBand: Record<string, GnomadRow>
  byInheritance: Record<Inheritance, GnomadRow>
}

function int(n: number) {
  return n.toLocaleString('en-US')
}

function pct(n: number, d: number) {
  return `${Math.round((100 * n) / d)}%`
}

function ratio(
  e: { [ODDS]: number; [INTERVAL]: [number, number] },
  digits = 1,
) {
  const [low, high] = e[INTERVAL]
  return `${e[ODDS].toFixed(digits)}× (95% CI ${low.toFixed(digits)}–${high.toFixed(digits)})`
}

function odds(e: Enrichment) {
  return `${ratio(e)}, ${int(e['proteins informative'])} proteins`
}

function fraction(text: string) {
  const [a = 0, b = 0] = text.split('/').map(Number)
  return { a, b }
}

export function mappingCheck(interfaces: string, variants: string) {
  const blocks = new Map<string, [number, number][]>()
  for (const line of interfaces.split('\n').filter(Boolean)) {
    const cols = line.split('\t')
    const name = (cols[3] ?? '').split(' (')[0] ?? ''
    const start = Number(cols[1])
    const sizes = (cols[10] ?? '').split(',').filter(Boolean).map(Number)
    const starts = (cols[11] ?? '').split(',').filter(Boolean).map(Number)
    blocks.set(name, [
      ...(blocks.get(name) ?? []),
      ...starts.map((s, i): [number, number] => [
        start + s,
        start + s + (sizes[i] ?? 0),
      ]),
    ])
  }
  const checked = variants
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const cols = line.split('\t')
      const name = cols[3] ?? ''
      const gene = name.split(' ')[0] ?? ''
      const partners = (name.split('interface with ')[1] ?? '').split(', ')
      const position = Number(cols[1])
      return {
        gene,
        inside: partners.some(partner =>
          (blocks.get(`${gene}–${partner}`) ?? []).some(
            ([a, b]) => position >= a && position < b,
          ),
        ),
      }
    })
  const outside = checked.filter(v => !v.inside)
  return {
    variants: checked.length,
    inside: checked.length - outside.length,
    outsideGenes: [...new Set(outside.map(v => v.gene))].sort(),
  }
}

function readGene(page: string): GenePage {
  return JSON.parse(
    readFileSync(join(SITE_DATA, 'genes', `${page}.json`), 'utf8'),
  )
}

function pathogenicWith(page: string, partner: (name: string) => boolean) {
  const gene = readGene(page)
  return gene.variants
    .filter(v => v.label === 'pathogenic' && v.partners.some(partner))
    .map(v => v.change)
}

export function findings(
  s: Summary,
  gnomad: GnomadResult,
  mapping: ReturnType<typeof mappingCheck>,
) {
  const e = s.enrichment
  const arm = (name: string, control: string) => {
    const row = e.byMechanism[name]?.[control]
    return row ? odds(row) : '—'
  }
  const [hetero, homo] = Object.values(e.byKind).map(kind => kind[SURFACE])
  const bands = Object.entries(e.byConfidenceBand).filter(([name]) =>
    name.startsWith('ipSAE'),
  )
  const amBands = Object.entries(e.byAlphaMissenseClass)
  const [lowest, , , highest] = s.conservation.variants.quartiles
  const share = (q: typeof lowest) =>
    q ? pct(q.pathogenic, q.pathogenic + q.benign) : ''
  const residues = s.conservation.residues
  const bandShares = Object.values(residues.byConfidenceBand).map(
    b => (100 * b['interface more conserved']) / b.complexes,
  )
  const patches = residues.patches.all
  const nearbyPatches = residues.nearbyPatches.all
  const gAll = gnomad.all
  const gi = fraction(gAll['missense / synonymous at interface'])
  const go = fraction(gAll['missense / synonymous at other surface'])
  const v = s.variantsAtInterface
  const calls = s.alphaMissense.calls
  const uncertain = calls.uncertain
  const vhl = pathogenicWith('VHL', name => name === 'ELOC')
  const gnaoBeta = pathogenicWith('GNAO1', name => name.startsWith('GNB'))
  const gnaoRgs = pathogenicWith('GNAO1', name => name.startsWith('RGS'))
  const all = s.validation.all
  const unseen = s.validation.unseen
  const r = s.regions.regions
  const placed = Object.values(r)
  const total = (label: 'pathogenic' | 'benign') =>
    placed.reduce((n, x) => n + x[label], 0)
  const atSite = (label: 'pathogenic' | 'benign') =>
    placed.reduce((n, x) => n + x['at a UniProt site'][label], 0)
  const shares = (name: keyof typeof r) =>
    `${pct(r[name].pathogenic, total('pathogenic'))} of pathogenic, ${pct(r[name].benign, total('benign'))} of benign`
  const buriedInterface =
    s.regions['interface residues the single chain buries']
  const exposedGenes = s.regions['exposed surface genes']
  return `# Findings

Generated by \`pnpm findings\` from the pipeline's output; edit
\`src/findings.ts\`, not this file.

Across all ${int(s.proteins)} UniProt disease proteins.

- ${int(s.withPartner)} (${pct(s.withPartner, s.proteins)}) have an AlphaFold DB complex: a heterodimer with
  another protein, or a homodimer with a copy of themselves. AlphaFold DB
  publishes only complexes it calls "tentatively high-confidence": ipSAE ≥
  ${s.thresholds.ipsae} in both directions (the lower of chain A → B and B → A), mean pLDDT ≥
  ${s.thresholds.plddt} and few backbone clashes ([Han et al. 2026](https://research.nvidia.com/labs/dbr/assets/data/manuscripts/afdb.html);
  ipSAE: [Dunbrack 2025](https://doi.org/10.1101/2025.02.10.637595)).
- Most pathogenic missense in these proteins is not at an interface. Placing
  ${int(total('pathogenic'))} pathogenic and ${int(total('benign'))} benign variants by the complexes and by
  each protein's single-chain AlphaFold model:
  - buried core: ${shares('buried core')}
  - interface: ${shares('interface')}
  - the rest of the folded surface: ${shares('exposed surface')}
  - not confidently modelled (pLDDT < ${s.thresholds.plddt}): ${shares('low confidence')}

  UniProt's curated binding, active and other sites hold ${int(atSite('pathogenic'))} pathogenic and
  ${int(atSite('benign'))} benign variants across all four. The folded surface away from any
  interface holds ${int(r['exposed surface'].pathogenic)} pathogenic variants in ${int(s.regions['exposed surface pathogenic genes'])} genes, the most in
  ${exposedGenes.map(([gene, n]) => `${gene} (${n})`).join(', ')}. Several of these form
  tetramers, filaments or other assemblies larger than the two chains
  AlphaFold DB models, so some of those residues may sit at an interface the
  atlas does not have. For predicted effects on folding stability,
  [ProtVar](https://www.ebi.ac.uk/ProtVar/) gives FoldX estimates for each
  variant ([Jänes et al. 2024](https://doi.org/10.1101/2024.05.29.596373)).
- Within each protein, pathogenic missense variants sit at a predicted
  interface ${ratio(e.all)} as often as benign ones (Mantel–Haenszel odds ratio,
  ${int(e.all['proteins informative'])} proteins with variants at an interface). This confirms earlier work rather than
  being new: [Burke et al. 2023](https://doi.org/10.1038/s41594-022-00910-8)
  found 2.3-fold on AlphaFold2 models of HuRI and hu.MAP pairs, and
  [Wang et al. 2012](https://doi.org/10.1038/nbt.2106),
  [Sahni et al. 2015](https://doi.org/10.1016/j.cell.2015.04.013) and
  [David & Sternberg 2015](https://doi.org/10.1016/j.jmb.2015.07.004) showed it
  on experimental interfaces and in the lab. The controls below are what this
  adds. Counting only folded, surface-exposed residues, it is
  ${odds(e.orderedSurface)}, so the effect is not just "folded vs disordered".
- Folded residues alone give ${odds(e.ordered)}: the buried core is rich in
  pathogenic variants and mostly not at an interface, so the surface
  comparison sets it aside. That also sets aside the interface residues the
  single chain buries, which hold ${int(buriedInterface.pathogenic)} pathogenic variants to
  ${int(buriedInterface.benign)} benign.
- It holds for both kinds of complex. On the folded surface, interfaces with
  other proteins give ${hetero ? odds(hetero) : '—'}, and the interface a homodimer's two
  copies share gives ${homo ? odds(homo) : '—'}.
- It holds in every confidence band. Against residues at no interface:
${bands.map(([name, band]) => `  ${name}, ${odds(band)}`).join(';\n')}.
- Not every pair has an experiment behind it. IntAct or BioGRID report
  ${int(s.pairs.direct)} of the ${int(s.pairs.all)} pairs binding directly and ${int(s.pairs.complex)} only in the same
  complex; for the other ${int(s.pairs.all - s.pairs.direct - s.pairs.complex)} the prediction is the only evidence.
  Against residues at no interface, the interfaces of pairs that
${Object.entries(e.byPairEvidence)
  .map(([name, band]) => `  ${name}, ${odds(band)}`)
  .join(';\n')}.
- The interface adds little beyond AlphaMissense. Within AlphaMissense's
  evidence bands, as calibrated for clinical use by Bergquist et al. 2025
  ([Genet Med 27:101402](https://doi.org/10.1016/j.gim.2025.101402)):
${amBands.map(([name, band]) => `  ${name.replace('AlphaMissense ', '')}, ${odds(band)}`).join(';\n')}.
- Inheritance does not change what the interface marks. Over all residues
  the effect looks larger for variants of dominant diseases,
  ${arm('dominant variants', ALL)}, than of recessive ones,
  ${arm('recessive variants', ALL)}, as it would if dominant missense acted
  through binding and recessive missense through the fold. On the folded
  surface the two overlap: ${arm('dominant variants', SURFACE)} against
  ${arm('recessive variants', SURFACE)}. Most of the gap goes once the buried core is set aside,
  so it reflects where in the fold the variants fall; the surface intervals
  are too wide to rule out a smaller difference there. Genes with no pathogenic
  truncating variant in ClinVar give ${arm('missense-only genes', SURFACE)} on
  the folded surface, and those with at least two give
  ${arm('truncation-pathogenic genes', SURFACE)}. Inheritance is HPO's, through
  each variant's OMIM diseases.
- Conservation explains only part of it. Of the variants classified pathogenic
  or benign, ${share(highest)} are pathogenic in the top quarter of 100-way vertebrate
  phyloP, against ${share(lowest)} in the bottom quarter. Comparing variants only within the
  same quarter takes the odds ratio from ${ratio(s.conservation.enrichment.all.unmatched)} to
  ${ratio(s.conservation.enrichment.all.matched)} over all residues, and from
  ${ratio(s.conservation.enrichment.orderedSurface.unmatched)} to ${ratio(s.conservation.enrichment.orderedSurface.matched)} on the folded surface.
- The predicted interfaces are more conserved than the rest of the surface.
  Against the same protein's other folded surface residues at no confident
  interface, matched for exposure and pLDDT, the interface is more conserved in
  ${pct(residues.all['interface more conserved'], residues.all.complexes)} of ${int(residues.all.complexes)} confident complexes, and in ${Math.round(Math.min(...bandShares))}–${Math.round(Math.max(...bandShares))}% within each
  ipSAE band.
- That is not what any patch of surface would show. Ranked among patches of
  its size from the same protein's other folded surface, the interface beats
  the median one in ${pct(patches['above the median patch'].interface, patches.complexes)} of ${int(patches.complexes)} complexes, against
  ${pct(patches['above the median patch'].fake, patches.complexes)} for a random patch ranked the same way in its place, and 95% of them in
  ${pct(patches['above 95% of patches'].interface, patches.complexes)}, against ${pct(patches['above 95% of patches'].fake, patches.complexes)}. Ranked only among patches centred near it, it
  beats the median one in ${pct(nearbyPatches['above the median patch'].interface, nearbyPatches.complexes)}, against ${pct(nearbyPatches['above the median patch'].fake, nearbyPatches.complexes)}, so it is not
  just sitting in a conserved domain. Conservation marks most predicted
  interfaces as functional surface; it cannot vouch for the partner, since
  AlphaFold reads the same alignments.
- The general population agrees, weakly. In gnomAD v4.1 exomes, interface
  residues carry ${int(gi.a)} missense variants to ${int(gi.b)} synonymous, against
  ${int(go.a)} to ${int(go.b)} on the other folded surface. Within each protein, the
  missense-to-synonymous ratio at the interface is ${ratio(gAll, 2)} that
  of the other folded surface (Mantel–Haenszel, ${int(gAll.proteins)} proteins), and
  ${Object.values(gnomad.byConfidenceBand)
    .map(b => b[ODDS].toFixed(2))
    .join(', ')} from the lowest ipSAE band to the highest. The
  synonymous variants at the same residues control for mutation rate and
  coverage, but not for the residues' make-up: interface and surface differ in
  amino acids, and so in what share of each codon's changes are missense. The
  effect is small, since the rest of the surface is also
  constrained. It comes mostly from dominant genes, ${ratio(gnomad.byInheritance.dominant, 2)}
  (${int(gnomad.byInheritance.dominant.proteins)} proteins), against ${ratio(gnomad.byInheritance.recessive, 2)}
  for recessive ones (${int(gnomad.byInheritance.recessive.proteins)}), though phyloP marks the
  interfaces of both about equally.
- ${int(v.pathogenic + v.uncertain + v.benign)} classified missense variants sit at a confident interface:
  ${int(v.pathogenic)} pathogenic, ${int(v.uncertain)} of uncertain significance and ${int(v.benign)} benign. Examples:
  VHL's ${vhl.length} pathogenic variants at the elongin C interface, and GNAO1's at the
  Gβ (${gnaoBeta.slice(0, 3).join(', ')}) and RGS (${gnaoRgs.slice(0, 3).join(', ')}) interfaces.
- AlphaMissense scores ${int(uncertain.scored)} of the ${int(v.uncertain)} uncertain ones and gives
  ${int(uncertain.pp3)} (${pct(uncertain.pp3, uncertain.scored)}) at least supporting evidence of pathogenicity (PP3) and
  ${int(uncertain.bp4)} (${pct(uncertain.bp4, uncertain.scored)}) evidence of benignity (BP4), against PP3 for
  ${pct(calls.pathogenic.pp3, calls.pathogenic.scored)} of the pathogenic and ${pct(calls.benign.pp3, calls.benign.scored)} of the benign variants at an interface. Its
  developers' ${ALPHAMISSENSE_LIKELY_PATHOGENIC} "likely pathogenic" cut-off does not reach supporting
  evidence. It scores each protein without its partner.
- ${int(s.leads.variants)} of the uncertain variants, in ${int(s.leads.genes)} genes, change an interface residue
  where a substitution is already classified pathogenic: the same amino-acid
  change for ${int(s.leads.sameChange)} (ACMG PS1), a different one for the rest (PM5).
- The predictions match experiment where it exists. ${int(all.pairs)} predicted pairs
  can be compared with a PDB entry holding both proteins (two copies, for a
  homodimer), and in ${int(all.touching)} of those the two touch. The predicted interface
  covers a median ${pct(all.recall, 1)} of the experimental one, and ${pct(all.precision, 1)} of the
  predicted residues the structure resolves are in it. For the ${int(unseen.pairs)} pairs with
  no structure deposited by AlphaFold's training cutoff (${s.validation.cutoff}),
  it is ${pct(unseen.recall, 1)} and ${pct(unseen.precision, 1)}. Most of the ${int(all.pairs - all.touching)} that do not touch are
  subunits of rings and large assemblies that are not neighbours. Pairs with
  a deposited structure lean towards stable, well-studied complexes, so the
  agreement may be lower for pairs that are only predicted.
- ${((100 * mapping.inside) / mapping.variants).toFixed(1)}% of the interface variants' genomic positions fall inside
  their gene's interface codons, an independent check of the residue → codon
  mapping. The rest belong to ${mapping.outsideGenes.join(', ')}; several of
  these proteins are encoded by more than one identical gene, so the codons are
  drawn on one copy while ClinVar names another.

## Caveats

- Coverage: AlphaFold DB modelled STRING physical-interaction pairs only;
  TP53 has none and KRAS has no RAF. A homodimer shows two copies, so a
  tetramer or larger ring shows one of its interfaces.
- The complexes and isoform models are predictions. A low isoform pLDDT where
  the canonical model is confident hints that the isoform does not keep that
  part folded; it is not a measurement.
- The interface is every residue within ${s.thresholds.contact} Å of the partner, so it takes in
  the rim and residues partly buried in the protein itself; interface and core
  overlap. A variant at an interface may matter for folding, for another
  partner or not at all.
- ${int(s.unmapped)} disease genes with a confident complex are left out because the EBI
  Proteins API gives no primary-assembly coding coordinates that match their
  length.
`
}

if (import.meta.main) {
  const summary: Summary = JSON.parse(
    readFileSync(join(SITE_DATA, 'summary.json'), 'utf8'),
  )
  const gnomad: GnomadResult = JSON.parse(
    readFileSync(join(OUT, 'gnomad.json'), 'utf8'),
  )
  const mapping = mappingCheck(
    readFileSync(join(OUT, 'interfaces.bed'), 'utf8'),
    readFileSync(join(OUT, 'interface_variants.bed'), 'utf8'),
  )
  writeFileSync(FINDINGS, findings(summary, gnomad, mapping))
  console.log(`wrote ${FINDINGS}`)
}
