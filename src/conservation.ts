import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { gunzipSync } from 'node:zlib'

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
import { atomsByChain, boundedMap } from './atlas.ts'
import type { ChainAtom } from './atlas.ts'
import { confidentResidues, isConfident, readAtlas } from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { CONFIDENT, MIN_PLDDT, NEIGHBOURHOOD } from './constants.ts'
import { squaredDistance } from './contacts.ts'
import type { Point } from './contacts.ts'
import { codingPositions, mergeBlocks } from './coordinates.ts'
import type { CodingPositions } from './coordinates.ts'
import {
  list,
  number,
  readJson,
  record,
  records,
  text,
  writeAtomically,
  writeJson,
} from './json.ts'
import { nanPercentile, pythonRound, seededRandom } from './numeric.ts'
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
export const IPSAE_BANDS = bands([CONFIDENT, 0.7, 0.8, 0.9, Infinity])
const QUARTERS = [0, 1, 2, 3]

type CodonScores = (number | null)[][]

export interface PatchRank {
  anywhere?: number
  nearby?: number
}

export interface Residue {
  stratum: string
  score: number
}

export interface SurfaceResidue extends Residue {
  residue: number
  centre?: Point
}

export interface Located extends SurfaceResidue {
  centre: Point
}

export async function patientFetch(
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

export function cachedCodonScores(accession: string) {
  const path = join(CACHE, `${accession}.json`)
  return existsSync(path) ? readCodons(path) : undefined
}

export function readPatchRanks() {
  return new Map(
    records(record(readJson(CONSERVATION)).complexes).flatMap(complex => {
      const accession = text(complex.accession)
      const entity = text(complex.entity)
      return accession !== undefined && entity !== undefined
        ? [
            [
              `${accession} ${entity}`,
              {
                anywhere: number(complex.anywhere),
                nearby: number(complex.nearby),
              },
            ] satisfies [string, PatchRank],
          ]
        : []
    }),
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

export function residueCentres(atoms: ChainAtom[]) {
  return new Map(
    [...Map.groupBy(atoms, atom => atom.position)].flatMap(
      ([position, group]) => {
        const centre = centroid(group.map(atom => atom.coord))
        return centre ? [[position, centre] satisfies [number, Point]] : []
      },
    ),
  )
}

function monomerCentres(accession: string) {
  const path = join(DATA, 'monomer_cif', `${accession}.cif.gz`)
  const [atoms] = existsSync(path)
    ? atomsByChain(gunzipSync(readFileSync(path)).toString('utf8')).values()
    : []
  return residueCentres(atoms ?? [])
}

function surfaceResidues(
  protein: AtlasProtein,
  scores: CodonScores,
  centres: Map<number, Point>,
) {
  return Object.entries(protein.context).flatMap(([key, [plddt, rsa]]) => {
    const residue = Number(key)
    const score = codonMean(scores, residue)
    return plddt >= MIN_PLDDT && rsa >= SURFACE && score !== undefined
      ? [
          {
            residue,
            stratum: `${Math.min(Math.floor(rsa * 5), 4)} ${plddt >= VERY_CONFIDENT}`,
            score,
            centre: centres.get(residue),
          } satisfies SurfaceResidue,
        ]
      : []
  })
}

function isLocated(residue: SurfaceResidue): residue is Located {
  return residue.centre !== undefined
}

export function centroid(points: Point[]) {
  const mean = (axis: 0 | 1 | 2) =>
    points.reduce((sum, point) => sum + point[axis], 0) / points.length
  return points.length
    ? ([mean(0), mean(1), mean(2)] satisfies Point)
    : undefined
}

export function neighbourOrders(candidates: Located[]) {
  return new Map(
    candidates.map(centre => [
      centre,
      candidates.toSorted(
        (a, b) =>
          squaredDistance(centre.centre, a.centre) -
          squaredDistance(centre.centre, b.centre),
      ),
    ]),
  )
}

function patchAround(
  centre: Located,
  orders: Map<Located, Located[]>,
  allowed: Set<SurfaceResidue>,
  size: number,
) {
  return (orders.get(centre) ?? []).filter(r => allowed.has(r)).slice(0, size)
}

export function leftOutDifference(patch: Residue[], outside: Residue[]) {
  const taken = new Set(patch)
  return matchedDifference(
    patch,
    outside.filter(r => !taken.has(r)),
  ).difference
}

export function patchScores(
  size: number,
  outside: SurfaceResidue[],
  centres: Located[],
  orders: Map<Located, Located[]>,
) {
  const allowed = new Set<SurfaceResidue>(outside)
  return outside.filter(isLocated).length >= 2 * size
    ? centres
        .filter(centre => allowed.has(centre))
        .map(centre =>
          leftOutDifference(
            patchAround(centre, orders, allowed, size),
            outside,
          ),
        )
        .filter(d => !Number.isNaN(d))
    : []
}

export function percentile(score: number, patches: number[]) {
  return patches.length
    ? (patches.filter(p => p < score).length +
        patches.filter(p => p === score).length / 2) /
        patches.length
    : undefined
}

function within(candidates: Located[], patch: SurfaceResidue[]) {
  const middle = centroid(patch.filter(isLocated).map(r => r.centre))
  return middle
    ? candidates.filter(
        r => squaredDistance(r.centre, middle) <= NEIGHBOURHOOD ** 2,
      )
    : []
}

export function patchTests(
  inside: SurfaceResidue[],
  outside: SurfaceResidue[],
  orders: Map<Located, Located[]>,
  fakeCentre: Located | undefined,
) {
  const size = inside.length
  const candidates = outside.filter(isLocated)
  const score = matchedDifference(inside, outside).difference
  const fake = fakeCentre
    ? patchAround(fakeCentre, orders, new Set(outside), size)
    : []
  const taken = new Set<SurfaceResidue>(fake)
  const outsideFake = outside.filter(r => !taken.has(r))
  const fakeScore = matchedDifference(fake, outsideFake).difference
  const rank = (centres: (patch: SurfaceResidue[]) => Located[]) => ({
    interface: percentile(
      score,
      patchScores(size, outside, centres(inside), orders),
    ),
    fake:
      fake.length === size
        ? percentile(
            fakeScore,
            patchScores(size, outsideFake, centres(fake), orders),
          )
        : undefined,
  })
  return {
    anywhere: rank(() => candidates),
    nearby: rank(patch => within(candidates, patch)),
  }
}

export function complexDifferences(
  protein: AtlasProtein,
  scores: CodonScores,
  centres: Map<number, Point>,
  random: () => number,
) {
  const surface = surfaceResidues(protein, scores, centres)
  const confident = protein.interfaces.filter(isConfident)
  const anywhere = new Set(
    confident.flatMap(c => confidentResidues(c, protein.length)),
  )
  const outside = surface.filter(r => !anywhere.has(r.residue))
  const strata = new Set(outside.map(r => r.stratum))
  const candidates = outside.filter(isLocated)
  const orders = neighbourOrders(candidates)
  return confident.flatMap(complex => {
    const residues = new Set(confidentResidues(complex, protein.length))
    const inside = surface.filter(
      r => residues.has(r.residue) && strata.has(r.stratum),
    )
    const fakeCentre = candidates[Math.floor(random() * candidates.length)]
    return inside.length >= MIN_RESIDUES && outside.length >= MIN_RESIDUES
      ? [
          {
            entity: complex.entity,
            ipsae: complex.ipsae ?? 0,
            difference: matchedDifference(inside, outside).difference,
            ...patchTests(inside, outside, orders, fakeCentre),
          },
        ]
      : []
  })
}

interface Ranks {
  interface?: number
  fake?: number
}

function patchSummary(ranks: Ranks[]) {
  const ranked = ranks.flatMap(r =>
    r.interface === undefined || r.fake === undefined
      ? []
      : [{ interface: r.interface, fake: r.fake }],
  )
  const count = (test: (percentile: number) => boolean) => ({
    interface: ranked.filter(r => test(r.interface)).length,
    fake: ranked.filter(r => test(r.fake)).length,
  })
  return {
    complexes: ranked.length,
    'above the median patch': count(p => p > 0.5),
    'above 95% of patches': count(p => p > 0.95),
    'median percentile': pythonRound(
      nanPercentile(
        ranked.map(r => r.interface),
        50,
      ),
      2,
    ),
  }
}

function differenceSummary(differences: number[]) {
  return {
    complexes: differences.length,
    'interface more conserved': differences.filter(d => d > 0).length,
    'median difference': pythonRound(nanPercentile(differences, 50), 2),
  }
}

function patchSummaries(complexes: { ipsae: number; ranks: Ranks }[]) {
  return {
    all: patchSummary(complexes.map(c => c.ranks)),
    byConfidenceBand: Object.fromEntries(
      IPSAE_BANDS.map(band => [
        bandName(band),
        patchSummary(
          complexes.filter(c => inBand(c.ipsae, band)).map(c => c.ranks),
        ),
      ]),
    ),
  }
}

export function inBand(score: number, [low, high]: Band) {
  return score >= low && score < high
}

export function bandName([low, high]: Band) {
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
  const random = seededRandom(0)
  const differences = scored.flatMap(({ protein, scores }) =>
    complexDifferences(
      protein,
      scores,
      monomerCentres(protein.accession),
      random,
    ).map(d => ({ ...d, accession: protein.accession })),
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
      patches: patchSummaries(
        differences.map(d => ({ ipsae: d.ipsae, ranks: d.anywhere })),
      ),
      nearbyPatches: patchSummaries(
        differences.map(d => ({ ipsae: d.ipsae, ranks: d.nearby })),
      ),
    },
  }
  writeJson(
    CONSERVATION,
    {
      ...result,
      complexes: differences.map(d => ({
        accession: d.accession,
        entity: d.entity,
        anywhere: d.anywhere.interface,
        nearby: d.nearby.interface,
      })),
    },
    2,
  )
  console.log(JSON.stringify(result, undefined, 2))
}

if (import.meta.main) {
  const [workers] = process.argv.slice(2)
  await main(workers ? Number(workers) : undefined)
}
