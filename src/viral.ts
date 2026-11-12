import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import { readScores } from './alphamissense.ts'
import { boundedMap } from './atlas.ts'
import { readAtlas } from './atlasData.ts'
import { download, getJson } from './cache.ts'
import { CONTACT } from './constants.ts'
import { withinDistance } from './contacts.ts'
import {
  ENTRIES,
  ENTRIES_URL,
  SIFTS,
  SIFTS_URL,
  depositionDates,
  parseSifts,
  sharedEntries,
} from './experimental.ts'
import { number, record, records, text, writeJson } from './json.ts'
import { DATA, OUT, SITE_DATA } from './paths.ts'
import { atoms, mmcif } from './pdbe.ts'
import type { Atom } from './pdbe.ts'
import {
  accessionOf,
  diseaseEntries,
  geneOf,
  humanEntries,
  sequenceOf,
} from './uniprot.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

const SARS2 = 2697049
const VIRAL_ENTRIES = join(DATA, 'uniprot_sars2.json')
export const VIRAL = join(OUT, 'viral.json')
const MAX_CHAINS = 120
const MAX_ENTRIES = 4
const SAME_NUMBERING = 0.9
const PROGRESS_EVERY = 10
const REAGENTS = new Map([
  ['APOA1', 'the scaffold protein of the nanodisc the viral protein sits in'],
  ['PSAP', 'the saposin of the nanodisc the viral protein sits in'],
  ['COL18A1', 'the trimerisation domain of an engineered spike antagonist'],
])

export interface Mature {
  name: string
  begin: number
  end: number
}

interface ViralProtein {
  accession: string
  name: string
  length: number
  mature: Mature[]
}

function base(accession: string) {
  return accession.split('-')[0] ?? accession
}

export function matureProteins(entry: Record<string, unknown>): Mature[] {
  const length = sequenceOf(entry).length
  const chains = records(entry.features).flatMap(feature => {
    const location = record(feature.location)
    const begin = number(record(location.start).value)
    const end = number(record(location.end).value)
    return feature.type === 'Chain' && begin !== undefined && end !== undefined
      ? [{ name: text(feature.description) ?? '', begin, end }]
      : []
  })
  const parts = chains.filter(chain => chain.end - chain.begin + 1 < length)
  return parts.length ? parts : chains
}

function holding(mature: Mature[], residue: number) {
  return mature
    .filter(part => residue >= part.begin && residue <= part.end)
    .sort((a, b) => a.end - a.begin - (b.end - b.begin))[0]
}

export function matureName(mature: Mature[], residues: number[]) {
  const named = residues.flatMap(
    residue => holding(mature, residue)?.name ?? [],
  )
  return [...new Set(named)].join(', ')
}

export function localNumbers(mature: Mature[], residues: number[]) {
  const parts = new Set(residues.map(residue => holding(mature, residue)?.name))
  const part = residues.length ? holding(mature, residues[0] ?? 0) : undefined
  return part && parts.size === 1
    ? residues.map(residue => residue - part.begin + 1)
    : []
}

async function viralProteins() {
  const stream = await getJson(
    'https://rest.uniprot.org/uniprotkb/stream',
    VIRAL_ENTRIES,
    {
      query: `organism_id:${SARS2} AND reviewed:true`,
      fields: 'accession,protein_name,ft_chain,sequence',
      format: 'json',
    },
  )
  return records(record(stream).results).map((entry): ViralProtein => ({
    accession: accessionOf(entry),
    name:
      text(
        record(
          record(record(entry.proteinDescription).recommendedName).fullName,
        ).value,
      ) ?? '',
    length: sequenceOf(entry).length,
    mature: matureProteins(entry),
  }))
}

export function chainOf(rows: Atom[], accession: string) {
  return rows.filter(atom => base(atom.source?.accession ?? '') === accession)
}

export function separateChains(rows: Atom[], own: string, other: string) {
  const entitiesOf = (accession: string) =>
    new Set(chainOf(rows, accession).map(atom => atom.entity))
  const fused = entitiesOf(own).intersection(entitiesOf(other))
  const apart = (accession: string) =>
    chainOf(rows, accession).filter(atom => !fused.has(atom.entity))
  return { own: apart(own), other: apart(other), fused: fused.size > 0 }
}

export function trustworthy(chain: Atom[], sequence: string) {
  const matching = chain.filter(
    atom => sequence[(atom.source?.number ?? 0) - 1] === atom.sourceLetter,
  )
  return matching.length >= SAME_NUMBERING * chain.length ? matching : []
}

export function touching(own: Atom[], other: Atom[]) {
  const within = withinDistance(
    own.map(atom => atom.xyz),
    other.map(atom => atom.xyz),
    CONTACT,
  )
  return [
    ...new Set(
      own.flatMap((atom, i) => (within[i] ? (atom.source?.number ?? []) : [])),
    ),
  ].sort((a, b) => a - b)
}

interface Candidate {
  accession: string
  gene: string
  sequence: string
  viral: ViralProtein
  entries: { pdb: string; chains: number }[]
}

interface Contact {
  accession: string
  gene: string
  viral: string
  viralName: string
  protein: string
  pdb: string
  firstDeposited: string
  tried: string[]
  fusions: string[]
  reagent: string | null
  residues: number[]
  viralResidues: number[]
  viralNumbers: number[]
  neighbours: string[]
  variants: {
    change: string
    label: Variant['label']
    position: number
    variation: number
    alphaMissense: number | null
    conditions: string[]
  }[]
}

function variantsAt(
  found: Variant[],
  residues: Set<number>,
  scores: Map<string, number> | undefined,
) {
  return found
    .filter(variant => residues.has(variant.position))
    .map(variant => ({
      change: variant.change,
      label: variant.label,
      position: variant.position,
      variation: variant.variation,
      alphaMissense: scores?.get(variant.change) ?? null,
      conditions: variant.conditions,
    }))
}

interface Found {
  key: string
  pdb: string
  fused: boolean
  residues: number[]
  viralResidues: number[]
  resolved: number[]
  neighbours: string[]
}

export function neighbouringProteins(rows: Atom[], viral: string) {
  const own = chainOf(rows, viral)
  const others = rows.filter(
    atom => atom.source && base(atom.source.accession) !== viral,
  )
  const within = withinDistance(
    others.map(atom => atom.xyz),
    own.map(atom => atom.xyz),
    CONTACT,
  )
  return [
    ...new Set(
      others.flatMap((atom, i) =>
        within[i] ? base(atom.source?.accession ?? '') : [],
      ),
    ),
  ]
}

async function entryContacts(pdb: string, candidates: Candidate[]) {
  const rows = atoms(await mmcif(pdb))
  const neighbours = new Map(
    [...new Set(candidates.map(candidate => candidate.viral.accession))].map(
      viral => [viral, neighbouringProteins(rows, viral)],
    ),
  )
  return candidates.map(({ accession, sequence, viral }): Found => {
    const separate = separateChains(rows, accession, viral.accession)
    const human = trustworthy(separate.own, sequence)
    const residues =
      human.length && separate.other.length
        ? touching(human, separate.other)
        : []
    return {
      key: `${accession}\t${viral.accession}`,
      pdb,
      fused: separate.fused,
      residues,
      viralResidues: residues.length ? touching(separate.other, human) : [],
      resolved: [
        ...new Set(separate.other.flatMap(atom => atom.source?.number ?? [])),
      ],
      neighbours: neighbours.get(viral.accession) ?? [],
    }
  })
}

function bestEntry(found: Found[]) {
  return found.reduce((best, entry) =>
    entry.residues.length > best.residues.length ? entry : best,
  )
}

export async function main(workers = 4) {
  await download(SIFTS_URL, SIFTS)
  const { coverage, chains } = parseSifts(
    gunzipSync(readFileSync(SIFTS)).toString('utf8'),
  )
  await download(ENTRIES_URL, ENTRIES)
  const deposited = depositionDates(readFileSync(ENTRIES, 'utf8'))
  const viral = await viralProteins()
  const genes = new Map(
    readAtlas().map(protein => [protein.accession, protein.gene]),
  )
  const humanGenes = new Map(
    (await humanEntries()).map(entry => [accessionOf(entry), geneOf(entry)]),
  )
  const sequences = new Map(
    (await diseaseEntries()).map(entry => [
      accessionOf(entry),
      sequenceOf(entry),
    ]),
  )
  const candidates = [...sequences].flatMap(([accession, sequence]) =>
    viral.flatMap(protein => {
      const shared = sharedEntries(
        coverage.get(accession),
        coverage.get(protein.accession),
      )
        .map(entry => ({ ...entry, chains: chains.get(entry.pdb) ?? 0 }))
        .filter(entry => entry.chains <= MAX_CHAINS)
        .sort((a, b) => a.chains - b.chains || (a.pdb < b.pdb ? -1 : 1))
        .slice(0, MAX_ENTRIES)
      return shared.length
        ? [
            {
              accession,
              gene: genes.get(accession) ?? '',
              sequence,
              viral: protein,
              entries: shared,
            } satisfies Candidate,
          ]
        : []
    }),
  )
  const wanted = new Set(candidates.map(candidate => candidate.accession))
  const variants = await readVariants(accession => wanted.has(accession))
  const scores = readScores()
  const byEntry = Map.groupBy(
    candidates.flatMap(candidate =>
      candidate.entries.map(entry => ({ candidate, pdb: entry.pdb })),
    ),
    task => task.pdb,
  )
  console.log(`${candidates.length} pairs in ${byEntry.size} PDB entries`)
  const results = await boundedMap(
    [...byEntry],
    workers,
    ([pdb, tasks]) =>
      entryContacts(
        pdb,
        tasks.map(task => task.candidate),
      ).catch((error: unknown) => ({ pdb, error: String(error) })),
    finished => {
      if (finished % PROGRESS_EVERY === 0) {
        console.log(`${finished}/${byEntry.size}`)
      }
    },
  )
  const byPair = Map.groupBy(
    results.flatMap(result => ('error' in result ? [] : result)),
    entry => entry.key,
  )
  const pairs = candidates.flatMap(
    ({ accession, viral: protein }): Contact[] => {
      const found = byPair.get(`${accession}\t${protein.accession}`) ?? []
      const best = found.length ? bestEntry(found) : undefined
      return best
        ? [
            {
              accession,
              gene: genes.get(accession) ?? '',
              viral: protein.accession,
              viralName: protein.name,
              protein:
                matureName(
                  protein.mature,
                  best.viralResidues.length
                    ? best.viralResidues
                    : best.resolved,
                ) || protein.name,
              pdb: best.pdb,
              firstDeposited: deposited.get(best.pdb) ?? '',
              tried: found.map(entry => entry.pdb),
              fusions: found.flatMap(entry => (entry.fused ? [entry.pdb] : [])),
              reagent: REAGENTS.get(genes.get(accession) ?? '') ?? null,
              residues: best.residues,
              viralResidues: best.viralResidues,
              viralNumbers: localNumbers(protein.mature, best.viralResidues),
              neighbours: best.neighbours.map(
                neighbour => humanGenes.get(neighbour) ?? neighbour,
              ),
              variants: variantsAt(
                variants.get(accession) ?? [],
                new Set(best.residues),
                scores.get(accession),
              ),
            },
          ]
        : []
    },
  )
  const touched = pairs
    .filter(pair => pair.residues.length)
    .sort(
      (a, b) =>
        b.variants.length - a.variants.length ||
        b.residues.length - a.residues.length,
    )
  const contacts = touched.filter(pair => !pair.reagent)
  const reagents = touched.filter(pair => pair.reagent)
  const apart = pairs.flatMap(pair =>
    pair.residues.length
      ? []
      : [
          {
            gene: pair.gene,
            accession: pair.accession,
            protein: pair.protein,
            tried: pair.tried,
            fusions: pair.fusions,
            neighbours: pair.neighbours,
          },
        ],
  )
  const summary = {
    'viral proteins': viral.length,
    'disease proteins sharing an entry with one': new Set(
      candidates.map(candidate => candidate.accession),
    ).size,
    'pairs in one PDB entry': candidates.length,
    'pairs that touch': contacts.length,
    'pairs that touch only as a structural reagent': reagents.length,
    'pairs in one entry that do not touch': apart.length,
    'touching pairs with a classified variant at the contact': contacts.filter(
      contact => contact.variants.length,
    ).length,
    failed: results.flatMap(result => ('error' in result ? [result] : [])),
  }
  writeJson(VIRAL, { summary, contacts, reagents, apart }, 2)
  writeJson(join(SITE_DATA, 'viral.json'), {
    summary,
    contacts,
    reagents,
    apart,
  })
  console.log(JSON.stringify(summary, undefined, 2))
}

if (import.meta.main) {
  const [workers] = process.argv.slice(2)
  await main(workers ? Number(workers) : undefined)
}
