import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import { boundedMap } from './atlas.ts'
import {
  confidentResidues,
  isConfident,
  partnerName,
  readAtlas,
} from './atlasData.ts'
import { download } from './cache.ts'
import { CONTACT } from './constants.ts'
import { withinDistance } from './contacts.ts'
import { number, readJson, record, records, text, writeJson } from './json.ts'
import { nanPercentile, pythonRound } from './numeric.ts'
import { DATA, OUT } from './paths.ts'
import { atoms, mmcif } from './pdbe.ts'
import type { Atom } from './pdbe.ts'
import { accessionOf, diseaseEntries, sequenceOf } from './uniprot.ts'

export const SIFTS_URL =
  'https://ftp.ebi.ac.uk/pub/databases/msd/sifts/flatfiles/tsv/pdb_chain_uniprot.tsv.gz'
export const SIFTS = join(DATA, 'sifts', 'pdb_chain_uniprot.tsv.gz')
export const ENTRIES_URL =
  'https://files.wwpdb.org/pub/pdb/derived_data/index/entries.idx'
export const ENTRIES = join(DATA, 'sifts', 'entries.idx')
export const EXPERIMENTAL = join(OUT, 'experimental.json')
export const TRAINING_CUTOFF = '2021-09-30'
const NEAR_BEST = 0.9
const MAX_CHAINS = 60
const RECOVERED = 0.5
const SAME_NUMBERING = 0.9
const BINS = 10
const PROGRESS_EVERY = 100

type Coverage = Map<string, number>

export interface Pair {
  accession: string
  gene: string
  partner: string
  partner_gene: string
  entity: string
  ipsae: number
  predicted: number[]
  sequence: string
  firstDeposited: string
}

export function parseSifts(content: string) {
  const byChain = new Map<string, number>()
  const segments = new Map<string, [number, number][]>()
  const tandem = new Map<string, Set<string>>()
  for (const line of content.split('\n')) {
    const [pdb, chain, accession, , , , , begin, end] = line.split('\t')
    const length = Number(end) - Number(begin) + 1
    if (pdb && chain && accession && Number.isFinite(length)) {
      const key = `${accession}\t${pdb}\t${chain}`
      byChain.set(key, (byChain.get(key) ?? 0) + length)
      const seen = segments.get(key) ?? []
      const range: [number, number] = [Number(begin), Number(end)]
      if (seen.some(([b, e]) => range[0] <= e && b <= range[1])) {
        tandem.set(accession, (tandem.get(accession) ?? new Set()).add(pdb))
      }
      segments.set(key, [...seen, range])
    }
  }
  const coverage = new Map<string, Coverage>()
  const copies = new Map<string, Coverage>()
  const chains = new Map<string, Set<string>>()
  for (const [key, length] of byChain) {
    const [accession = '', pdb = '', chain = ''] = key.split('\t')
    const entries = coverage.get(accession) ?? new Map<string, number>()
    entries.set(pdb, Math.max(entries.get(pdb) ?? 0, length))
    coverage.set(accession, entries)
    const counted = copies.get(accession) ?? new Map<string, number>()
    counted.set(pdb, (counted.get(pdb) ?? 0) + 1)
    copies.set(accession, counted)
    chains.set(pdb, (chains.get(pdb) ?? new Set<string>()).add(chain))
  }
  return {
    coverage,
    copies,
    tandem,
    chains: new Map(chains.entries().map(([pdb, found]) => [pdb, found.size])),
  }
}

export function sharedEntries(
  own: Coverage = new Map(),
  partner: Coverage = new Map(),
) {
  return [...own].flatMap(([pdb, covered]) => {
    const other = partner.get(pdb)
    return other === undefined ? [] : [{ pdb, covered: covered + other }]
  })
}

export function homodimerEntries(
  own: Coverage = new Map(),
  copies: Coverage = new Map(),
  tandem = new Set<string>(),
) {
  return [...own].flatMap(([pdb, covered]) =>
    (copies.get(pdb) ?? 0) >= 2 && !tandem.has(pdb)
      ? [{ pdb, covered: 2 * covered }]
      : [],
  )
}

export function chooseEntry(
  shared: { pdb: string; covered: number }[],
  chains: Map<string, number>,
) {
  const sized = shared
    .map(entry => ({ ...entry, chains: chains.get(entry.pdb) ?? 0 }))
    .filter(entry => entry.chains <= MAX_CHAINS)
  const most = Math.max(...sized.map(entry => entry.covered))
  return sized
    .filter(entry => entry.covered >= NEAR_BEST * most)
    .sort((a, b) => a.chains - b.chains || (a.pdb < b.pdb ? -1 : 1))[0]?.pdb
}

function isoformOf(atom: Atom, accession: string) {
  return atom.source?.accession.split('-')[0] === accession
}

export function interfaceAgreement(
  rows: Atom[],
  { accession, sequence }: { accession: string; sequence: string },
  partner: string,
  predicted: number[],
) {
  const chain = rows.filter(atom => isoformOf(atom, accession))
  const homodimer = partner === accession
  const first = chain[0]?.chain
  const copy = homodimer ? chain.filter(atom => atom.chain === first) : chain
  const own = copy.filter(
    atom =>
      atom.source && sequence[atom.source.number - 1] === atom.sourceLetter,
  )
  const other = homodimer
    ? chain.filter(atom => atom.chain !== first)
    : rows.filter(atom => isoformOf(atom, partner))
  const within = withinDistance(
    own.map(atom => atom.xyz),
    other.map(atom => atom.xyz),
    CONTACT,
  )
  const observed = new Set(own.flatMap(atom => atom.source?.number ?? []))
  const experimental = new Set(
    own.flatMap((atom, i) => (within[i] ? (atom.source?.number ?? []) : [])),
  )
  const comparable = predicted.filter(residue => observed.has(residue))
  return own.length >= SAME_NUMBERING * copy.length && other.length
    ? {
        experimental: experimental.size,
        predicted: comparable.length,
        shared: comparable.filter(residue => experimental.has(residue)).length,
      }
    : undefined
}

export interface Comparison {
  accession: string
  entity: string
  pdb: string
  firstDeposited: string
  experimental: number
  predicted: number
  shared: number
}

function median(values: number[]) {
  return pythonRound(nanPercentile(values, 50), 2)
}

export function summarise(
  compared: Pick<Comparison, 'experimental' | 'predicted' | 'shared'>[],
) {
  const touching = compared.filter(pair => pair.experimental > 0)
  const recall = touching.map(pair => pair.shared / pair.experimental)
  return {
    pairs: compared.length,
    touching: touching.length,
    recall: median(recall),
    precision: median(
      touching
        .filter(pair => pair.predicted > 0)
        .map(pair => pair.shared / pair.predicted),
    ),
    recovered: recall.filter(share => share >= RECOVERED).length,
    histogram: Array.from(
      { length: BINS },
      (_, bin) =>
        recall.filter(
          share => Math.min(Math.floor(share * BINS), BINS - 1) === bin,
        ).length,
    ),
  }
}

export function validation(compared: Comparison[]) {
  return {
    cutoff: TRAINING_CUTOFF,
    all: summarise(compared),
    unseen: summarise(
      compared.filter(pair => pair.firstDeposited > TRAINING_CUTOFF),
    ),
  }
}

export function readComparisons() {
  return records(record(readJson(EXPERIMENTAL)).pairs).flatMap(pair => {
    const accession = text(pair.accession)
    const entity = text(pair.entity)
    const pdb = text(pair.pdb)
    const experimental = number(pair.experimental)
    const predicted = number(pair.predicted)
    const shared = number(pair.shared)
    return accession !== undefined &&
      entity !== undefined &&
      pdb !== undefined &&
      experimental !== undefined &&
      predicted !== undefined &&
      shared !== undefined
      ? [
          {
            accession,
            entity,
            pdb,
            firstDeposited: text(pair.firstDeposited) ?? '',
            experimental,
            predicted,
            shared,
          } satisfies Comparison,
        ]
      : []
  })
}

export function depositionDates(index: string) {
  return new Map(
    index.split('\n').flatMap(line => {
      const [pdb, , date = ''] = line.split('\t')
      const [, month, day, year] = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(date) ?? []
      return pdb && year
        ? [
            [
              pdb.toLowerCase(),
              `${Number(year) < 70 ? '20' : '19'}${year}-${month}-${day}`,
            ] satisfies [string, string],
          ]
        : []
    }),
  )
}

async function compareEntry(pdb: string, pairs: Pair[]) {
  const rows = atoms(await mmcif(pdb))
  return pairs.flatMap(({ predicted, sequence, ...pair }) => {
    const agreement = interfaceAgreement(
      rows,
      { accession: pair.accession, sequence },
      pair.partner,
      predicted,
    )
    return agreement ? [{ ...pair, pdb, ...agreement }] : []
  })
}

async function confidentPairs() {
  const sequences = new Map(
    (await diseaseEntries()).map(entry => [
      accessionOf(entry),
      sequenceOf(entry),
    ]),
  )
  return readAtlas().flatMap(protein =>
    protein.interfaces.filter(isConfident).flatMap(complex =>
      complex.partner
        ? [
            {
              accession: protein.accession,
              gene: protein.gene,
              partner: complex.partner,
              partner_gene: partnerName(complex),
              entity: complex.entity,
              ipsae: complex.ipsae ?? 0,
              predicted: confidentResidues(complex, protein.length),
              sequence: sequences.get(protein.accession) ?? '',
            },
          ]
        : [],
    ),
  )
}

export async function main(workers = 4) {
  await download(SIFTS_URL, SIFTS)
  const { coverage, copies, tandem, chains } = parseSifts(
    gunzipSync(readFileSync(SIFTS)).toString('utf8'),
  )
  await download(ENTRIES_URL, ENTRIES)
  const deposited = depositionDates(readFileSync(ENTRIES, 'utf8'))
  const pairs = await confidentPairs()
  const located = pairs.map(pair => {
    const shared =
      pair.partner === pair.accession
        ? homodimerEntries(
            coverage.get(pair.accession),
            copies.get(pair.accession),
            tandem.get(pair.accession),
          )
        : sharedEntries(
            coverage.get(pair.accession),
            coverage.get(pair.partner),
          )
    return {
      pair: {
        ...pair,
        firstDeposited:
          shared.flatMap(entry => deposited.get(entry.pdb) ?? []).sort()[0] ??
          '',
      } satisfies Pair,
      shared: shared.length,
      pdb: chooseEntry(shared, chains),
    }
  })
  const byEntry = Map.groupBy(
    located.flatMap(({ pair, pdb }) => (pdb ? [{ pair, pdb }] : [])),
    ({ pdb }) => pdb,
  )
  const results = await boundedMap(
    [...byEntry],
    workers,
    ([pdb, found]) =>
      compareEntry(
        pdb,
        found.map(({ pair }) => pair),
      ).catch((error: unknown) => ({ pdb, error: String(error) })),
    finished => {
      if (finished % PROGRESS_EVERY === 0) {
        console.log(`${finished}/${byEntry.size}`)
      }
    },
  )
  const compared = results.flatMap(result => ('error' in result ? [] : result))
  const summary = {
    'confident predicted pairs': pairs.length,
    'with both proteins in one PDB entry': located.filter(l => l.shared > 0)
      .length,
    [`only in entries of more than ${MAX_CHAINS} chains, left out`]:
      located.filter(l => l.shared > 0 && !l.pdb).length,
    'in an entry that does not resolve both proteins':
      located.filter(l => l.pdb).length - compared.length,
    ...validation(compared),
    failed: results.flatMap(result => ('error' in result ? [result] : [])),
  }
  writeJson(EXPERIMENTAL, { summary, pairs: compared }, 2)
  console.log(JSON.stringify(summary, undefined, 2))
}

if (import.meta.main) {
  const [workers] = process.argv.slice(2)
  await main(workers ? Number(workers) : undefined)
}
