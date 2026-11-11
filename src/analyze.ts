import { join } from 'node:path'

import { readAtlas } from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { CONFIDENT, MIN_PLDDT } from './constants.ts'
import type { Label } from './constants.ts'
import { writeJson } from './json.ts'
import {
  nanPercentile,
  pairwiseSum,
  pythonRound,
  seededRandom,
} from './numeric.ts'
import { OUT } from './paths.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

const THRESHOLDS = {
  ipTM: [0.5, 0.6, 0.7, 0.8, 0.9],
  ipSAE: [0.6, 0.7, 0.8, 0.9],
}
const METRIC = { ipTM: 'iptm', ipSAE: 'ipsae' } as const
const BOOTSTRAPS = 2000
const SURFACE = 0.2
const EXAMPLES = 25
const SUMMARY_LABELS: Label[] = ['pathogenic', 'benign', 'uncertain']

type Metric = (typeof METRIC)[keyof typeof METRIC]
type Context = [number, number] | undefined
export type Table = [number, number, number, number]

export interface ProteinVariants extends AtlasProtein {
  variants: Variant[]
}

export function interfaceScore(protein: AtlasProtein, metric: Metric) {
  const best = new Map<number, number>()
  for (const complex of protein.interfaces) {
    for (const [position, plddt] of Object.entries(complex.residues)) {
      if (plddt >= MIN_PLDDT) {
        best.set(
          Number(position),
          Math.max(best.get(Number(position)) ?? 0, complex[metric] || 0),
        )
      }
    }
  }
  return best
}

export const CONTROLS: Record<string, (context: Context) => boolean> = {
  'all residues': () => true,
  'ordered (pLDDT ≥ 70)': context =>
    context !== undefined && context[0] >= MIN_PLDDT,
  'ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)': context =>
    context !== undefined && context[0] >= MIN_PLDDT && context[1] >= SURFACE,
}

export function tables(
  proteins: ProteinVariants[],
  metric: Metric,
  threshold: number,
  keep: (context: Context) => boolean = () => true,
) {
  return proteins.flatMap(protein => {
    const best = interfaceScore(protein, metric)
    const kept = protein.variants.filter(v =>
      keep(protein.context[String(v.position)]),
    )
    const pathogenic = kept.filter(v => v.label === 'pathogenic')
    const benign = kept.filter(v => v.label === 'benign')
    const at = (variants: Variant[]) =>
      variants.filter(v => (best.get(v.position) ?? 0) >= threshold).length
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

export function bootstrap(rows: Table[], seed = 0) {
  const random = seededRandom(seed)
  const values = Array.from({ length: BOOTSTRAPS }, () =>
    mantelHaenszel(
      rows.flatMap(() => {
        const row = rows[Math.floor(random() * rows.length)]
        return row ? [row] : []
      }),
    ),
  )
  return [2.5, 97.5].map(percent =>
    pythonRound(nanPercentile(values, percent), 2),
  )
}

function enrichment(rows: Table[]) {
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
    'proteins informative': rows.length,
    'pathogenic at interface': `${a}/${a + b}`,
    'benign at interface': `${c}/${c + d}`,
    'Mantel–Haenszel odds ratio': pythonRound(mantelHaenszel(rows), 2),
    '95% CI (bootstrap over proteins)':
      rows.length > 2 ? bootstrap(rows) : null,
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
      const best = interfaceScore(protein, 'ipsae')
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
  const proteins = atlas.map(protein => ({
    ...protein,
    variants: variants.get(protein.accession) ?? [],
  }))
  const withComplex = proteins.filter(p => p.hetero)
  const confident = proteins.filter(p =>
    p.interfaces.some(c => (c.ipsae || 0) >= CONFIDENT),
  )
  const uncertain = uncertainAtInterfaces(proteins)
  const result = {
    summary: {
      'disease proteins': proteins.length,
      'with any predicted hetero complex': withComplex.length,
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
    controlled_for_order_and_surface: Object.fromEntries(
      Object.entries(CONTROLS).map(([name, keep]) => [
        name,
        enrichment(
          tables(
            withComplex.filter(p => Object.keys(p.context).length),
            'ipsae',
            CONFIDENT,
            keep,
          ),
        ),
      ]),
    ),
    enrichment: Object.fromEntries(
      Object.entries(THRESHOLDS).flatMap(([name, thresholds]) =>
        thresholds.map(threshold => [
          `${name} ≥ ${threshold}`,
          enrichment(
            tables(
              withComplex,
              name === 'ipTM' ? METRIC.ipTM : METRIC.ipSAE,
              threshold,
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
