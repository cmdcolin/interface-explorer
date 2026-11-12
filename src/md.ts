import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

import { BigWig } from '@gmod/bbi'
import { RemoteFile } from 'generic-filehandle2'

import { parseScore } from './alphamissense.ts'
import { atomsByChain } from './atlas.ts'
import type { ChainAtom } from './atlas.ts'
import { download } from './cache.ts'
import { PHYLOP, baseScores, residueCentres } from './conservation.ts'
import { squaredDistance } from './contacts.ts'
import type { Point } from './contacts.ts'
import { codingPositions } from './coordinates.ts'
import { list, readJson, text, writeJson } from './json.ts'
import { seededRandom } from './numeric.ts'
import { DATA, OUT, ROOT, SITE_DATA } from './paths.ts'
import { accessionOf, diseaseEntries, sequenceOf } from './uniprot.ts'
import { readVariants } from './variants.ts'

const ACCESSION = 'P78381'
const GENE = 'SLC35A2'
const SWITCHES = join(ROOT, 'slc35a2_switches.tsv')
const MODEL = `AF-${ACCESSION}-F1-model_v6`
const MODEL_URL = `https://alphafold.ebi.ac.uk/files/${MODEL}`
const SUBSTITUTIONS = join(DATA, 'AlphaMissense_aa_substitutions.tsv.gz')
const AM_CACHE = join(DATA, 'md', `alphamissense-${ACCESSION}.json`)
const ORDERED = 70
const BURIAL_RADIUS = 10
const BURIAL_BINS = 5
const DRAWS = 100_000
const HELIX_STEP = 4
const HELIX_RISE = 8.5
const MIN_HELIX = 14
const MISSENSE = /^[A-Z]\d+[A-Z]$/

export interface SwitchPair {
  residues: [number, number]
  c1: number
  c2: number
  change: number
  share: number
}

export interface LocalSwitch {
  residue: number
  c1: string
  c2: string
  divergence: number
}

export function parseSwitches(tsv: string) {
  const rows = tsv
    .trim()
    .split('\n')
    .slice(1)
    .map(line => line.split('\t'))
  const pairs = rows.flatMap(([kind, residues = '', c1, c2, change, share]) => {
    const [a, b] = residues.split('-').map(Number)
    return kind === 'pair' && a && b
      ? [{ residues: [a, b], c1: Number(c1), c2: Number(c2), change: Number(change), share: Number(share) } satisfies SwitchPair]
      : []
  })
  const local = rows.flatMap(([kind, residue, c1 = '', c2 = '', divergence]) =>
    kind === '3di' ? [{ residue: Number(residue), c1, c2, divergence: Number(divergence) } satisfies LocalSwitch] : [],
  )
  return { pairs, local }
}

export function burial(centres: Map<number, Point>, radius = BURIAL_RADIUS) {
  const limit = radius ** 2
  const all = [...centres.values()]
  return new Map(
    [...centres].map(([residue, centre]) => [
      residue,
      all.filter(other => squaredDistance(centre, other) <= limit).length - 1,
    ]),
  )
}

export function quantileBins(pool: number[], value: Map<number, number>, bins = BURIAL_BINS) {
  const sorted = pool.toSorted((a, b) => (value.get(a) ?? 0) - (value.get(b) ?? 0))
  return Array.from({ length: bins }, (_, bin) =>
    sorted.filter((_, i) => Math.floor((i * bins) / sorted.length) === bin),
  )
}

function shuffledPrefix(pool: number[], size: number, random: () => number) {
  const copy = [...pool]
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (copy.length - i))
    const swap = copy[j] ?? 0
    copy[j] = copy[i] ?? 0
    copy[i] = swap
  }
  return copy.slice(0, size)
}

export function permutationTest(
  bins: number[][],
  chosen: number[],
  stat: (set: number[]) => number,
  draws = DRAWS,
  seed = 0,
) {
  const random = seededRandom(seed)
  const wanted = bins.map(bin => chosen.filter(p => bin.includes(p)).length)
  const observed = stat(chosen)
  let atLeast = 0
  for (let i = 0; i < draws; i++) {
    const sample = bins.flatMap((bin, b) => shuffledPrefix(bin, wanted[b] ?? 0, random))
    if (stat(sample) >= observed) {
      atLeast++
    }
  }
  return { observed, p: (atLeast + 1) / (draws + 1) }
}

function unit([x, y, z]: Point): Point {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

function difference(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dot(a: Point, b: Point) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function helixAxis(centres: Map<number, Point>) {
  const helical = (residue: number) => {
    const here = centres.get(residue)
    const ahead = centres.get(residue + HELIX_STEP)
    return here && ahead ? squaredDistance(here, ahead) <= HELIX_RISE ** 2 : false
  }
  const residues = [...centres.keys()].toSorted((a, b) => a - b)
  const runs: number[][] = []
  for (const residue of residues) {
    const last = runs.at(-1)
    if (helical(residue)) {
      if (last && last.at(-1) === residue - 1) {
        last.push(residue)
      } else {
        runs.push([residue])
      }
    }
  }
  const directions = runs
    .filter(run => run.length >= MIN_HELIX)
    .flatMap(run => {
      const start = centres.get(run[0] ?? 0)
      const end = centres.get((run.at(-1) ?? 0) + HELIX_STEP)
      return start && end ? [unit(difference(end, start))] : []
    })
  const [first = [0, 0, 1]] = directions
  const sum = directions.reduce<Point>(
    (total, d) => {
      const sign = dot(d, first) < 0 ? -1 : 1
      return [total[0] + sign * d[0], total[1] + sign * d[1], total[2] + sign * d[2]]
    },
    [0, 0, 0],
  )
  return unit(sum)
}

async function substitutionLines() {
  const found: string[] = []
  if (existsSync(AM_CACHE)) {
    found.push(...list(readJson(AM_CACHE)).flatMap(line => text(line) ?? []))
  } else {
    for await (const line of createInterface({ input: createReadStream(SUBSTITUTIONS).pipe(createGunzip()) })) {
      if (line.startsWith(`${ACCESSION}\t`)) {
        found.push(line)
      }
    }
    writeJson(AM_CACHE, found)
  }
  return found
}

async function residueAlphaMissense() {
  const lines = await substitutionLines()
  const byPosition = new Map<number, number[]>()
  for (const found of lines.flatMap(line => parseScore(line) ?? [])) {
    const position = Number(found.change.slice(1, -1))
    byPosition.set(position, [...(byPosition.get(position) ?? []), found.pathogenicity])
  }
  return new Map([...byPosition].map(([position, scores]) => [position, mean(scores)]))
}

async function residuePhylop(length: number) {
  const coding = await codingPositions(ACCESSION, length)
  const byPosition = new Map<number, number>()
  if (coding) {
    const bases = Array.from({ length }, (_, i) => coding.codon(i + 1)).flat()
    const start = Math.min(...bases)
    const end = Math.max(...bases) + 1
    const bigwig = new BigWig({ filehandle: new RemoteFile(PHYLOP) })
    const scores = baseScores(await bigwig.getFeatures(coding.chrom, start, end), start, end)
    for (let residue = 1; residue <= length; residue++) {
      const values = coding.codon(residue).flatMap(base => scores.get(base) ?? [])
      if (values.length) {
        byPosition.set(residue, mean(values))
      }
    }
  }
  return byPosition
}

export function mean(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
}

function residuePlddt(atoms: ChainAtom[]) {
  return new Map([...Map.groupBy(atoms, atom => atom.position)].map(([position, group]) => [position, group[0]?.plddt ?? 0]))
}

export async function mdResult() {
  const { pairs, local } = parseSwitches(readFileSync(SWITCHES, 'utf8'))
  const cifPath = join(DATA, 'md', `${MODEL}.cif`)
  await download(`${MODEL_URL}.cif`, cifPath)
  const [atoms = []] = atomsByChain(readFileSync(cifPath, 'utf8')).values()
  const centres = residueCentres(atoms)
  const plddt = residuePlddt(atoms)
  const sequence = sequenceOf((await diseaseEntries()).find(entry => accessionOf(entry) === ACCESSION) ?? {})
  const alphaMissense = await residueAlphaMissense()
  const phylop = await residuePhylop(sequence.length)
  const variants = ((await readVariants(a => a === ACCESSION)).get(ACCESSION) ?? []).filter(
    v => MISSENSE.test(v.change) && v.position > 1,
  )
  const neighbours = burial(centres)
  const ordered = [...plddt].filter(([, score]) => score >= ORDERED).map(([position]) => position)
  const pairResidues = new Set(pairs.flatMap(pair => pair.residues))
  const localResidues = new Set(local.map(s => s.residue))
  const switches = [...new Set([...pairResidues, ...localResidues])].toSorted((a, b) => a - b)
  const chosen = switches.filter(p => ordered.includes(p))
  const bins = quantileBins(ordered, neighbours)
  const variantsAt = (position: number) => variants.filter(v => v.position === position)
  const withLabel = (label: string) => (set: number[]) =>
    set.filter(p => variantsAt(p).some(v => v.label === label)).length
  const pathogenicNearby = (set: number[]) =>
    new Set(set.flatMap(p => [p - 1, p, p + 1].flatMap(q => variantsAt(q).filter(v => v.label === 'pathogenic').map(v => v.change)))).size
  const meanOf = (scores: Map<number, number>) => (set: number[]) => mean(set.flatMap(p => scores.get(p) ?? []))
  return {
    accession: ACCESSION,
    gene: GENE,
    model: `${MODEL_URL}.bcif`,
    axis: helixAxis(centres),
    pairs,
    local,
    residues: switches.map(position => ({
      position,
      name: `${sequence[position - 1] ?? 'X'}${position}`,
      kind: pairResidues.has(position) ? (localResidues.has(position) ? 'both' : 'pair') : '3di',
      plddt: plddt.get(position) ?? 0,
      burial: neighbours.get(position) ?? 0,
      alphaMissense: alphaMissense.get(position) ?? null,
      phylop: phylop.get(position) ?? null,
      variants: variantsAt(position).map(({ change, label, variation }) => ({ change, label, variation })),
    })),
    background: {
      residues: ordered.length,
      tested: chosen.length,
      phylop: meanOf(phylop)(ordered),
      alphaMissense: meanOf(alphaMissense)(ordered),
      burial: meanOf(neighbours)(ordered),
      withPathogenic: withLabel('pathogenic')(ordered),
      withUncertain: withLabel('uncertain')(ordered),
      pathogenic: variants.filter(v => v.label === 'pathogenic').length,
    },
    tests: {
      phylop: permutationTest(bins, chosen, meanOf(phylop)),
      alphaMissense: permutationTest(bins, chosen, meanOf(alphaMissense)),
      burial: { observed: meanOf(neighbours)(chosen) },
      pathogenic: permutationTest(bins, chosen, withLabel('pathogenic')),
      pathogenicNearby: permutationTest(bins, chosen, pathogenicNearby),
      uncertain: permutationTest(bins, chosen, withLabel('uncertain')),
    },
  }
}

export async function main() {
  const result = await mdResult()
  writeJson(join(OUT, 'md.json'), result, 2)
  writeJson(join(SITE_DATA, 'md.json'), result)
  console.log(JSON.stringify({ background: result.background, tests: result.tests, axis: result.axis }, undefined, 2))
}

if (import.meta.main) {
  await main()
}
