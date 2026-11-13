import { join } from 'node:path'

import { readScores } from './alphamissense.ts'
import { isHomodimer, readAtlas } from './atlasData.ts'
import type { AtlasProtein, Interface } from './atlasData.ts'
import {
  BP4_SUPPORTING,
  CONFIDENT,
  MIN_PLDDT,
  PP3_SUPPORTING,
  alphaMissenseEvidence,
} from './constants.ts'
import type { Label } from './constants.ts'
import { pairKey, readInteractions } from './interactions.ts'
import type { PairEvidence } from './interactions.ts'
import { writeJson } from './json.ts'
import {
  notHaploinsufficient,
  readMechanism,
  variantInheritance,
} from './mechanism.ts'
import type { Mechanism } from './mechanism.ts'
import {
  nanPercentile,
  pairwiseSum,
  pythonRound,
  seededRandom,
} from './numeric.ts'
import { OUT } from './paths.ts'
import { SITE_TYPES, diseaseFeatures } from './uniprot.ts'
import type { Feature } from './uniprot.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

const BAND_EDGES = {
  ipTM: [0.5, 0.6, 0.7, 0.8, 0.9, Infinity],
  ipSAE: [0.6, 0.7, 0.8, 0.9, Infinity],
}
const METRIC = { ipTM: 'iptm', ipSAE: 'ipsae' } as const
export const CONFIDENT_BAND: Band = [CONFIDENT, Infinity]
const BOOTSTRAPS = 2000
export const SURFACE = 0.2
const EXAMPLES = 25
const SUMMARY_LABELS: Label[] = ['pathogenic', 'benign', 'uncertain']
const REGION_GENES = 12

type Metric = (typeof METRIC)[keyof typeof METRIC]
export type Score = (complex: Interface, protein: AtlasProtein) => number
type Context = [number, number] | undefined
export type Keep = (context: Context, variant: ScoredVariant) => boolean
export type Band = [number, number]
export type Table = [number, number, number, number]

export interface ScoredVariant extends Variant {
  alphaMissense?: number
  phylop?: number
}

export interface ProteinVariants extends AtlasProtein {
  variants: ScoredVariant[]
}

export function byMetric(metric: Metric): Score {
  return complex => complex[metric] || 0
}

export const EVIDENCE_BANDS = {
  'neither IntAct nor BioGRID reports': [0, 1],
  'IntAct or BioGRID report only in the same complex': [1, 2],
  'IntAct or BioGRID report binding directly': [2, 3],
} satisfies Record<string, Band>

export function byEvidence(interactions: Map<string, PairEvidence>): Score {
  return (complex, protein) => {
    const evidence = complex.partner
      ? interactions.get(pairKey(protein.accession, complex.partner))?.evidence
      : undefined
    return (complex.ipsae || 0) < CONFIDENT
      ? -1
      : evidence === 'direct'
        ? 2
        : evidence === 'complex'
          ? 1
          : 0
  }
}

export function interfaceScore(protein: AtlasProtein, score: Score) {
  const best = new Map<number, number>()
  for (const complex of protein.interfaces) {
    for (const [position, plddt] of Object.entries(complex.residues)) {
      if (plddt >= MIN_PLDDT) {
        best.set(
          Number(position),
          Math.max(
            best.get(Number(position)) ?? -Infinity,
            score(complex, protein),
          ),
        )
      }
    }
  }
  return best
}

export const CONTROLS: Record<string, Keep> = {
  'all residues': () => true,
  'ordered (pLDDT ≥ 70)': context =>
    context !== undefined && context[0] >= MIN_PLDDT,
  'ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)': context =>
    context !== undefined && context[0] >= MIN_PLDDT && context[1] >= SURFACE,
}

export const KINDS = {
  'with other proteins (heterodimers)': false,
  'with itself (homodimers)': true,
}

interface Arm {
  gene: (protein: AtlasProtein) => boolean
  variant: (variant: ScoredVariant) => boolean
}

export function mechanismArms(mechanism: Mechanism) {
  const inheritance = new Map(Object.entries(mechanism.inheritance))
  const classOf = (p: AtlasProtein) => mechanism.genes[p.gene]?.class
  const lowDosage = (p: AtlasProtein) =>
    notHaploinsufficient(mechanism.genes[p.gene]?.haploinsufficiency)
  const modeOf = (v: ScoredVariant) =>
    variantInheritance(v.diseases, inheritance)
  const any = () => true
  const classes = ['missense-only', 'truncation-pathogenic'] as const
  const modes = ['dominant', 'recessive'] as const
  return Object.fromEntries([
    ...classes.map(
      c =>
        [
          `${c} genes`,
          { gene: (p: AtlasProtein) => classOf(p) === c, variant: any },
        ] as const,
    ),
    ...modes.map(
      m =>
        [
          `${m} variants`,
          { gene: any, variant: (v: ScoredVariant) => modeOf(v) === m },
        ] as const,
    ),
    ...classes.flatMap(c =>
      modes.map(
        m =>
          [
            `${c} genes, ${m} variants`,
            {
              gene: (p: AtlasProtein) => classOf(p) === c,
              variant: (v: ScoredVariant) => modeOf(v) === m,
            },
          ] as const,
      ),
    ),
    ...classes.flatMap(c =>
      modes.map(
        m =>
          [
            `${c} genes, ${m} variants, ClinGen not haploinsufficient`,
            {
              gene: (p: AtlasProtein) => classOf(p) === c && lowDosage(p),
              variant: (v: ScoredVariant) => modeOf(v) === m,
            },
          ] as const,
      ),
    ),
  ]) satisfies Record<string, Arm>
}

export function armProteins(proteins: ProteinVariants[], arm: Arm) {
  return proteins
    .filter(arm.gene)
    .map(p => ({ ...p, variants: p.variants.filter(arm.variant) }))
}

export const ALPHAMISSENSE_CLASSES: Record<string, Keep> = {
  [`AlphaMissense BP4 (≤ ${BP4_SUPPORTING})`]: (_, v) =>
    v.alphaMissense !== undefined &&
    alphaMissenseEvidence(v.alphaMissense).points < 0,
  'AlphaMissense indeterminate': (_, v) =>
    v.alphaMissense !== undefined &&
    alphaMissenseEvidence(v.alphaMissense).points === 0,
  [`AlphaMissense PP3 (≥ ${PP3_SUPPORTING})`]: (_, v) =>
    v.alphaMissense !== undefined &&
    alphaMissenseEvidence(v.alphaMissense).points > 0,
}

export function bands(edges: number[]) {
  return edges.flatMap((low, i) => {
    const high = edges[i + 1]
    return high === undefined ? [] : [[low, high] satisfies Band]
  })
}

function bandName(name: string, [low, high]: Band) {
  return high === Infinity ? `${name} ≥ ${low}` : `${name} ${low}–${high}`
}

export function tables(
  proteins: ProteinVariants[],
  score: Score,
  [low, high]: Band,
  keep: Keep = () => true,
) {
  return proteins.flatMap(protein => {
    const best = interfaceScore(protein, score)
    const inBand = (v: Variant) => {
      const score = best.get(v.position)
      return score !== undefined && score >= low && score < high
    }
    const kept = protein.variants.filter(
      v =>
        (inBand(v) || !best.has(v.position)) &&
        keep(protein.context[String(v.position)], v),
    )
    const pathogenic = kept.filter(v => v.label === 'pathogenic')
    const benign = kept.filter(v => v.label === 'benign')
    const at = (variants: Variant[]) => variants.filter(inBand).length
    return pathogenic.length && benign.length
      ? [
          [
            at(pathogenic),
            pathogenic.length - at(pathogenic),
            at(benign),
            benign.length - at(benign),
          ] satisfies Table,
        ]
      : []
  })
}

export function mantelHaenszel(rows: Table[]) {
  const totals = rows.map(([a, b, c, d]) => a + b + c + d)
  const numerator = pairwiseSum(
    rows.map(([a, , , d], i) => (a * d) / (totals[i] ?? 0)),
  )
  const denominator = pairwiseSum(
    rows.map(([, b, c], i) => (b * c) / (totals[i] ?? 0)),
  )
  return !rows.length ? NaN : denominator ? numerator / denominator : Infinity
}

export function bootstrap(proteins: Table[][], seed = 0) {
  const random = seededRandom(seed)
  const values = Array.from({ length: BOOTSTRAPS }, () =>
    mantelHaenszel(
      proteins.flatMap(
        () => proteins[Math.floor(random() * proteins.length)] ?? [],
      ),
    ),
  )
  return [2.5, 97.5].map(percent =>
    pythonRound(nanPercentile(values, percent), 2),
  )
}

export function enrichment(rows: Table[]) {
  return stratifiedEnrichment(rows.map(row => [row]))
}

export function stratifiedEnrichment(proteins: Table[][]) {
  const rows = proteins.flat()
  const [a, b, c, d] = rows.reduce<Table>(
    (sum, row) => [
      sum[0] + row[0],
      sum[1] + row[1],
      sum[2] + row[2],
      sum[3] + row[3],
    ],
    [0, 0, 0, 0],
  )
  return {
    'proteins informative': proteins.filter(tables =>
      tables.some(([a, b, c, d]) => a * d + b * c > 0),
    ).length,
    'pathogenic at interface': `${a}/${a + b}`,
    'benign at interface': `${c}/${c + d}`,
    'Mantel–Haenszel odds ratio': pythonRound(mantelHaenszel(rows), 2),
    '95% CI (bootstrap over proteins)':
      proteins.length > 2 ? bootstrap(proteins) : null,
  }
}

export type Region =
  | 'interface'
  | 'buried core'
  | 'exposed surface'
  | 'low confidence'
  | 'no single-chain model'

export function regionOf(context: Context, atInterface: boolean): Region {
  return atInterface
    ? 'interface'
    : context === undefined
      ? 'no single-chain model'
      : context[0] < MIN_PLDDT
        ? 'low confidence'
        : context[1] < SURFACE
          ? 'buried core'
          : 'exposed surface'
}

export function siteResidues(features: Feature[]) {
  return new Set(
    features
      .filter(f => SITE_TYPES.includes(f.type))
      .flatMap(f =>
        Array.from({ length: f.end - f.start + 1 }, (_, k) => f.start + k),
      ),
  )
}

export function byRegion(
  proteins: ProteinVariants[],
  features: Map<string, Feature[]>,
) {
  const placed = proteins.flatMap(protein => {
    const best = interfaceScore(protein, byMetric('ipsae'))
    const sites = siteResidues(features.get(protein.accession) ?? [])
    return protein.variants.map(v => {
      const context = protein.context[String(v.position)]
      const atInterface = (best.get(v.position) ?? 0) >= CONFIDENT
      return {
        gene: protein.gene,
        label: v.label,
        region: regionOf(context, atInterface),
        buriedInterface:
          atInterface && regionOf(context, false) === 'buried core',
        site: sites.has(v.position),
      }
    })
  })
  const counts = (variants: typeof placed) => {
    const count = (label: Label) =>
      variants.filter(v => v.label === label).length
    return {
      pathogenic: count('pathogenic'),
      benign: count('benign'),
      uncertain: count('uncertain'),
    }
  }
  const tally = (region: Region) => {
    const inRegion = placed.filter(v => v.region === region)
    return {
      ...counts(inRegion),
      'at a UniProt site': counts(inRegion.filter(v => v.site)),
    }
  }
  const exposed = placed.filter(
    v => v.region === 'exposed surface' && v.label === 'pathogenic',
  )
  return {
    regions: {
      interface: tally('interface'),
      'buried core': tally('buried core'),
      'exposed surface': tally('exposed surface'),
      'low confidence': tally('low confidence'),
      'no single-chain model': tally('no single-chain model'),
    } satisfies Record<Region, unknown>,
    'interface residues the single chain buries': counts(
      placed.filter(v => v.buriedInterface),
    ),
    'exposed surface genes': [...Map.groupBy(exposed, v => v.gene)]
      .map(([gene, variants]): [string, number] => [gene, variants.length])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, REGION_GENES),
    'exposed surface pathogenic genes': new Set(exposed.map(v => v.gene)).size,
  }
}

function confidentPartners(protein: AtlasProtein, position: number) {
  return [
    ...new Set(
      protein.interfaces
        .filter(
          c => (c.ipsae || 0) >= CONFIDENT && String(position) in c.residues,
        )
        .map(c => c.partner_gene || c.partner || ''),
    ),
  ].sort()
}

function uncertainAtInterfaces(proteins: ProteinVariants[]) {
  return proteins
    .flatMap(protein => {
      const best = interfaceScore(protein, byMetric('ipsae'))
      return protein.variants
        .filter(
          v =>
            v.label === 'uncertain' && (best.get(v.position) ?? 0) >= CONFIDENT,
        )
        .map(
          v =>
            [
              protein.gene,
              v.change,
              pythonRound(best.get(v.position) ?? 0, 2),
              confidentPartners(protein, v.position).join(', '),
            ] satisfies [string, string, number, string],
        )
    })
    .sort((x, y) => y[2] - x[2])
}

export async function main() {
  const atlas = readAtlas()
  const accessions = new Set(atlas.map(p => p.accession))
  const variants = await readVariants(accession => accessions.has(accession))
  const scores = readScores()
  const interactions = readInteractions()
  const proteins: ProteinVariants[] = atlas.map(protein => ({
    ...protein,
    variants: (variants.get(protein.accession) ?? []).map(v => ({
      ...v,
      alphaMissense: scores.get(protein.accession)?.get(v.change),
    })),
  }))
  const withComplex = proteins.filter(p => p.hetero + p.homo > 0)
  const withContext = withComplex.filter(p => Object.keys(p.context).length)
  const confident = proteins.filter(p =>
    p.interfaces.some(c => (c.ipsae || 0) >= CONFIDENT),
  )
  const uncertain = uncertainAtInterfaces(proteins)
  const result = {
    summary: {
      'disease proteins': proteins.length,
      'with any predicted complex': withComplex.length,
      [`with a partner at ipSAE ≥ ${CONFIDENT}`]: confident.length,
      'classified missense variants in proteins with a complex':
        Object.fromEntries(
          SUMMARY_LABELS.map(label => [
            label,
            withComplex.flatMap(p => p.variants).filter(v => v.label === label)
              .length,
          ]),
        ),
      'uncertain variants at a confident interface': uncertain.length,
    },
    by_region: byRegion(withComplex, await diseaseFeatures()),
    controlled_for_order_and_surface: Object.fromEntries(
      Object.entries(CONTROLS).map(([name, keep]) => [
        name,
        enrichment(
          tables(withContext, byMetric('ipsae'), CONFIDENT_BAND, keep),
        ),
      ]),
    ),
    by_mechanism: Object.fromEntries(
      Object.entries(mechanismArms(readMechanism())).map(([name, arm]) => [
        name,
        Object.fromEntries(
          Object.entries(CONTROLS).map(([control, keep]) => [
            control,
            enrichment(
              tables(
                armProteins(withContext, arm),
                byMetric('ipsae'),
                CONFIDENT_BAND,
                keep,
              ),
            ),
          ]),
        ),
      ]),
    ),
    by_kind: Object.fromEntries(
      Object.entries(KINDS).map(([kind, homodimer]) => [
        kind,
        Object.fromEntries(
          Object.entries(CONTROLS).map(([name, keep]) => [
            name,
            enrichment(
              tables(
                withContext.map(p => ({
                  ...p,
                  interfaces: p.interfaces.filter(
                    c => isHomodimer(p, c) === homodimer,
                  ),
                })),
                byMetric('ipsae'),
                CONFIDENT_BAND,
                keep,
              ),
            ),
          ]),
        ),
      ]),
    ),
    by_pair_evidence: Object.fromEntries(
      Object.entries(EVIDENCE_BANDS).map(([name, band]) => [
        name,
        enrichment(tables(withComplex, byEvidence(interactions), band)),
      ]),
    ),
    by_alphamissense_class: Object.fromEntries(
      Object.entries(ALPHAMISSENSE_CLASSES).map(([name, keep]) => [
        name,
        enrichment(
          tables(withComplex, byMetric('ipsae'), CONFIDENT_BAND, keep),
        ),
      ]),
    ),
    by_confidence_band: Object.fromEntries(
      Object.entries(BAND_EDGES).flatMap(([name, edges]) =>
        bands(edges).map(band => [
          bandName(name, band),
          enrichment(
            tables(
              withComplex,
              byMetric(name === 'ipTM' ? METRIC.ipTM : METRIC.ipSAE),
              band,
            ),
          ),
        ]),
      ),
    ),
    uncertain_examples: uncertain.slice(0, EXAMPLES),
  }
  writeJson(join(OUT, 'analysis.json'), result, 2)
  console.log(JSON.stringify(result, undefined, 2))
}

if (import.meta.main) {
  await main()
}
