import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { BigWig } from '@gmod/bbi'
import type { Feature } from '@gmod/bbi'
import { RemoteFile } from 'generic-filehandle2'

import {
  CONFIDENT_BAND,
  CONTROLS,
  SURFACE,
  bands,
  enrichment,
  stratifiedEnrichment,
  tables,
} from './analyze.ts'
import type { Band, Keep, ProteinVariants, ScoredVariant } from './analyze.ts'
import { boundedMap } from './atlas.ts'
import { confidentResidues, isConfident, readAtlas } from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { CONFIDENT, MIN_PLDDT } from './constants.ts'
import { codingPositions, mergeBlocks } from './coordinates.ts'
import type { CodingPositions } from './coordinates.ts'
import { list, number, readJson, writeAtomically, writeJson } from './json.ts'
import { nanPercentile, pythonRound } from './numeric.ts'
import { DATA, OUT } from './paths.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

export const PHYLOP =
  'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/phyloP100way/hg38.phyloP100way.bw'
const CACHE = join(DATA, 'phylop100way')
export const CONSERVATION = join(OUT, 'conservation.json')
const ATTEMPTS = 7
const MIN_RESIDUES = 5
const VERY_CONFIDENT = 90
const IPSAE_BANDS = bands([CONFIDENT, 0.7, 0.8, 0.9, Infinity])
const QUARTERS = [0, 1, 2, 3]

type CodonScores = (number | null)[][]

export interface Residue {
  stratum: string
  score: number
}

async function patientFetch(
  input: string | Request,
  init?: RequestInit,
  attempt = 0,
): Promise<Response> {
  const response = await fetch(input, init).catch(() => undefined)
  return response?.ok
    ? response
    : attempt + 1 < ATTEMPTS
      ? sleep(1000 * 2 ** attempt).then(() =>
          patientFetch(input, init, attempt + 1),
        )
      : Promise.reject(
          new Error(
            `${typeof input === 'string' ? input : input.url}: ${response ? `HTTP ${response.status}` : 'no response'}`,
          ),
        )
}

export function baseScores(features: Feature[], start: number, end: number) {
  const scores = new Map<number, number>()
  for (const { start: from, end: to, score } of features) {
    if (score !== undefined) {
      for (let base = Math.max(from, start); base < Math.min(to, end); base++) {
        scores.set(base, score)
      }
    }
  }
  return scores
}

async function fetchCodons(
  phylop: BigWig,
  coding: CodingPositions,
  length: number,
) {
  const codons = Array.from({ length }, (_, i) => coding.codon(i + 1))
  const scores = new Map<number, number>()
  for (const [start, end] of mergeBlocks(codons.flat())) {
    const features = await phylop.getFeatures(coding.chrom, start, end)
    for (const [base, score] of baseScores(features, start, end)) {
      scores.set(base, score)
    }
  }
  return codons.map(codon => codon.map(base => scores.get(base) ?? null))
}

function readCodons(path: string): CodonScores {
  return list(readJson(path)).map(codon =>
    list(codon).map(s => number(s) ?? null),
  )
}

async function codonScores(
  phylop: BigWig,
  protein: AtlasProtein,
  coding: CodingPositions,
) {
  const path = join(CACHE, `${protein.accession}.json`)
  if (!existsSync(path)) {
    writeAtomically(
      path,
      JSON.stringify(await fetchCodons(phylop, coding, protein.length)),
    )
  }
  return readCodons(path)
}

export function variantScore(
  variant: Variant,
  coding: CodingPositions,
  scores: CodonScores,
) {
  const index = coding.codon(variant.position).indexOf(variant.pos - 1)
  return index < 0
    ? undefined
    : (scores[variant.position - 1]?.[index] ?? undefined)
}

export function quartileEdges(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  return [0.25, 0.5, 0.75].map(
    share => sorted[Math.floor(share * (sorted.length - 1))] ?? NaN,
  )
}

export function quarter(edges: number[], score: number) {
  return edges.filter(edge => score >= edge).length
}

function inQuarter(edges: number[], variant: ScoredVariant, index: number) {
  return (
    variant.phylop !== undefined && quarter(edges, variant.phylop) === index
  )
}

export function matchedTables(
  proteins: ProteinVariants[],
  keep: Keep,
  edges: number[],
) {
  return proteins.flatMap(protein => {
    const strata = QUARTERS.flatMap(index =>
      tables(
        [protein],
        'ipsae',
        CONFIDENT_BAND,
        (context, v) => keep(context, v) && inQuarter(edges, v, index),
      ),
    )
    return strata.length ? [strata] : []
  })
}

export function matchedDifference(inside: Residue[], outside: Residue[]) {
  const strata = Map.groupBy(outside, r => r.stratum)
  const matched = inside.flatMap(r => {
    const others = strata.get(r.stratum)
    return others
      ? [r.score - others.reduce((sum, o) => sum + o.score, 0) / others.length]
      : []
  })
  return {
    residues: matched.length,
    difference: matched.reduce((sum, d) => sum + d, 0) / matched.length,
  }
}

function codonMean(scores: CodonScores, residue: number) {
  const codon = (scores[residue - 1] ?? []).filter(s => s !== null)
  return codon.length === 3
    ? codon.reduce((sum, s) => sum + s, 0) / 3
    : undefined
}

function surfaceResidues(protein: AtlasProtein, scores: CodonScores) {
  return Object.entries(protein.context).flatMap(([key, [plddt, rsa]]) => {
    const residue = Number(key)
    const score = codonMean(scores, residue)
    return plddt >= MIN_PLDDT && rsa >= SURFACE && score !== undefined
      ? [
          {
            residue,
            stratum: `${Math.min(Math.floor(rsa * 5), 4)} ${plddt >= VERY_CONFIDENT}`,
            score,
          },
        ]
      : []
  })
}

export function complexDifferences(protein: AtlasProtein, scores: CodonScores) {
  const surface = surfaceResidues(protein, scores)
  const confident = protein.interfaces.filter(isConfident)
  const anywhere = new Set(
    confident.flatMap(c => confidentResidues(c, protein.length)),
  )
  const outside = surface.filter(r => !anywhere.has(r.residue))
  return confident.flatMap(complex => {
    const residues = new Set(confidentResidues(complex, protein.length))
    const inside = surface.filter(r => residues.has(r.residue))
    const { residues: matched, difference } = matchedDifference(inside, outside)
    return matched >= MIN_RESIDUES && outside.length >= MIN_RESIDUES
      ? [{ entity: complex.entity, ipsae: complex.ipsae ?? 0, difference }]
      : []
  })
}

function differenceSummary(differences: number[]) {
  return {
    complexes: differences.length,
    'interface more conserved': differences.filter(d => d > 0).length,
    'median difference': pythonRound(nanPercentile(differences, 50), 2),
  }
}

function inBand(score: number, [low, high]: Band) {
  return score >= low && score < high
}

function bandName([low, high]: Band) {
  return high === Infinity ? `ipSAE ≥ ${low}` : `ipSAE ${low}–${high}`
}

export async function main(workers = 4) {
  const phylop = new BigWig({
    filehandle: new RemoteFile(PHYLOP, { fetch: patientFetch }),
  })
  const atlas = readAtlas().filter(p => p.hetero)
  const scored = (
    await boundedMap(
      atlas,
      workers,
      async protein => {
        const coding = await codingPositions(protein.accession, protein.length)
        return coding
          ? [
              {
                protein,
                coding,
                scores: await codonScores(phylop, protein, coding),
              },
            ]
          : []
      },
      finished => {
        if (finished % 100 === 0) {
          console.log(`${finished}/${atlas.length} proteins`)
        }
      },
    )
  ).flat()
  const accessions = new Set(scored.map(s => s.protein.accession))
  const variants = await readVariants(accession => accessions.has(accession))
  const proteins: ProteinVariants[] = scored.map(
    ({ protein, coding, scores }) => ({
      ...protein,
      variants: (variants.get(protein.accession) ?? []).flatMap(variant => {
        const phylop = variantScore(variant, coding, scores)
        return phylop === undefined ? [] : [{ ...variant, phylop }]
      }),
    }),
  )
  const scoredVariants = proteins.flatMap(p => p.variants)
  const edges = quartileEdges(scoredVariants.flatMap(v => v.phylop ?? []))
  const withContext = proteins.filter(p => Object.keys(p.context).length)
  const differences = scored.flatMap(({ protein, scores }) =>
    complexDifferences(protein, scores),
  )
  const result = {
    source: PHYLOP,
    variants: {
      scored: scoredVariants.length,
      edges: edges.map(edge => pythonRound(edge, 2)),
      quartiles: QUARTERS.map(index => {
        const inside = scoredVariants.filter(v => inQuarter(edges, v, index))
        const count = (label: Variant['label']) =>
          inside.filter(v => v.label === label).length
        return {
          pathogenic: count('pathogenic'),
          benign: count('benign'),
          uncertain: count('uncertain'),
        }
      }),
    },
    enrichment: Object.fromEntries(
      Object.entries(CONTROLS).map(([name, keep]) => [
        name,
        {
          unmatched: enrichment(
            tables(withContext, 'ipsae', CONFIDENT_BAND, keep),
          ),
          matched: stratifiedEnrichment(
            matchedTables(withContext, keep, edges),
          ),
        },
      ]),
    ),
    residues: {
      all: differenceSummary(differences.map(d => d.difference)),
      byConfidenceBand: Object.fromEntries(
        IPSAE_BANDS.map(band => [
          bandName(band),
          differenceSummary(
            differences
              .filter(d => inBand(d.ipsae, band))
              .map(d => d.difference),
          ),
        ]),
      ),
    },
  }
  writeJson(CONSERVATION, result, 2)
  console.log(JSON.stringify(result, undefined, 2))
}

if (import.meta.main) {
  const [workers] = process.argv.slice(2)
  await main(workers ? Number(workers) : undefined)
}
