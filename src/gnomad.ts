import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { BigBed } from '@gmod/bbi'
import { RemoteFile } from 'generic-filehandle2'

import { SURFACE, bootstrap, mantelHaenszel } from './analyze.ts'
import type { Table } from './analyze.ts'
import { boundedMap } from './atlas.ts'
import { confidentResidues, isConfident, readAtlas } from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { MIN_PLDDT } from './constants.ts'
import { IPSAE_BANDS, bandName, inBand, patientFetch } from './conservation.ts'
import { codingPositions, mergeBlocks } from './coordinates.ts'
import type { CodingPositions } from './coordinates.ts'
import { list, number, readJson, writeAtomically, writeJson } from './json.ts'
import { pythonRound } from './numeric.ts'
import { DATA, OUT } from './paths.ts'

export const GNOMAD =
  'https://hgdownload.soe.ucsc.edu/gbdb/hg38/gnomAD/v4.1/exomes/exomes.bb'
const CACHE = join(DATA, 'gnomad')
export const GNOMAD_RESULT = join(OUT, 'gnomad.json')
const CONSEQUENCES = ['missense', 'synonymous']

type ResidueCounts = [missense: number, synonymous: number]

export function consequenceIndex(rest: string) {
  const [ref, alt, filter, alleleCount, consequence] = [6, 7, 8, 9, 16].map(
    column => rest.split('\t')[column],
  )
  const index = CONSEQUENCES.findIndex(c => c === consequence)
  return ref?.length === 1 &&
    alt?.length === 1 &&
    filter === 'PASS' &&
    Number(alleleCount) > 0 &&
    index >= 0
    ? index
    : undefined
}

export function residueCounts(
  codons: number[][],
  observed: Map<number, number[]>,
) {
  return codons.map(codon => {
    const counts: ResidueCounts = [0, 0]
    for (const base of codon) {
      for (const index of observed.get(base) ?? []) {
        counts[index] = (counts[index] ?? 0) + 1
      }
    }
    return counts
  })
}

async function fetchCounts(
  gnomad: BigBed,
  coding: CodingPositions,
  length: number,
) {
  const codons = Array.from({ length }, (_, i) => coding.codon(i + 1))
  const observed = new Map<number, number[]>()
  for (const [start, end] of mergeBlocks(codons.flat())) {
    for (const feature of await gnomad.getFeatures(coding.chrom, start, end)) {
      const index = consequenceIndex(feature.rest ?? '')
      if (index !== undefined) {
        observed.set(feature.start, [
          ...(observed.get(feature.start) ?? []),
          index,
        ])
      }
    }
  }
  return residueCounts(codons, observed)
}

function readCounts(path: string) {
  return list(readJson(path)).map(
    pair =>
      [
        number(list(pair)[0]) ?? 0,
        number(list(pair)[1]) ?? 0,
      ] satisfies ResidueCounts,
  )
}

async function proteinCounts(
  gnomad: BigBed,
  protein: AtlasProtein,
  coding: CodingPositions,
) {
  const path = join(CACHE, `${protein.accession}.json`)
  if (!existsSync(path)) {
    writeAtomically(
      path,
      JSON.stringify(await fetchCounts(gnomad, coding, protein.length)),
    )
  }
  return readCounts(path)
}

function total(residues: Iterable<number>, counts: ResidueCounts[]) {
  const sum: ResidueCounts = [0, 0]
  for (const residue of residues) {
    const [missense = 0, synonymous = 0] = counts[residue - 1] ?? []
    sum[0] += missense
    sum[1] += synonymous
  }
  return sum
}

export function proteinTable(
  protein: AtlasProtein,
  counts: ResidueCounts[],
  accepts: (ipsae: number) => boolean,
) {
  const surface = new Set(
    Object.entries(protein.context).flatMap(([residue, [plddt, rsa]]) =>
      plddt >= MIN_PLDDT && rsa >= SURFACE ? [Number(residue)] : [],
    ),
  )
  const confident = protein.interfaces.filter(isConfident)
  const anywhere = new Set(
    confident.flatMap(c => confidentResidues(c, protein.length)),
  )
  const inside = new Set(
    confident
      .filter(c => accepts(c.ipsae ?? 0))
      .flatMap(c => confidentResidues(c, protein.length))
      .filter(residue => surface.has(residue)),
  )
  const outside = [...surface].filter(residue => !anywhere.has(residue))
  const [insideMissense, insideSynonymous] = total(inside, counts)
  const [outsideMissense, outsideSynonymous] = total(outside, counts)
  const table: Table = [
    insideMissense,
    insideSynonymous,
    outsideMissense,
    outsideSynonymous,
  ]
  return inside.size && outside.length && table.some(count => count > 0)
    ? [table]
    : []
}

export function summary(tables: Table[]) {
  const [a, b, c, d] = tables.reduce<Table>(
    (sum, [w, x, y, z]) => [sum[0] + w, sum[1] + x, sum[2] + y, sum[3] + z],
    [0, 0, 0, 0],
  )
  return {
    proteins: tables.length,
    'missense / synonymous at interface': `${a}/${b}`,
    'missense / synonymous at other surface': `${c}/${d}`,
    'Mantel–Haenszel odds ratio': pythonRound(mantelHaenszel(tables), 2),
    '95% CI (bootstrap over proteins)':
      tables.length > 2 ? bootstrap(tables.map(table => [table])) : null,
  }
}

export async function main(workers = 4) {
  const gnomad = new BigBed({
    filehandle: new RemoteFile(GNOMAD, { fetch: patientFetch }),
  })
  const atlas = readAtlas().filter(p => p.hetero)
  const counted = (
    await boundedMap(
      atlas,
      workers,
      async protein => {
        const coding = await codingPositions(protein.accession, protein.length)
        return coding
          ? [{ protein, counts: await proteinCounts(gnomad, protein, coding) }]
          : []
      },
      finished => {
        if (finished % 100 === 0) {
          console.log(`${finished}/${atlas.length} proteins`)
        }
      },
    )
  ).flat()
  const tablesFor = (accepts: (ipsae: number) => boolean) =>
    counted.flatMap(({ protein, counts }) =>
      proteinTable(protein, counts, accepts),
    )
  const result = {
    source: GNOMAD,
    all: summary(tablesFor(() => true)),
    byConfidenceBand: Object.fromEntries(
      IPSAE_BANDS.map(band => [
        bandName(band),
        summary(tablesFor(ipsae => inBand(ipsae, band))),
      ]),
    ),
  }
  writeJson(GNOMAD_RESULT, result, 2)
  console.log(JSON.stringify(result, undefined, 2))
}

if (import.meta.main) {
  const [workers] = process.argv.slice(2)
  await main(workers ? Number(workers) : undefined)
}
