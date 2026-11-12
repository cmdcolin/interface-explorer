import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { readAtlas } from './atlasData.ts'
import { download, getJson } from './cache.ts'
import { pairKey } from './interactions.ts'
import { readJson, record, records, text, writeJson } from './json.ts'
import { DATA, OUT } from './paths.ts'

export const CROSSREFS = join(OUT, 'crossrefs.json')
const COMPLEX_PORTAL_URL =
  'https://ftp.ebi.ac.uk/pub/databases/intact/complex/current/complextab/9606.tsv'
const COMPLEX_PORTAL = join(DATA, 'complexportal', '9606.tsv')
const STRING_IDS_URL = 'https://string-db.org/api/json/get_string_ids'
const STRING_CHUNK = 100

export interface Complex {
  ac: string
  name: string
}

export function participants(field: string) {
  const counts = new Map<string, number>()
  for (const member of field.split('|')) {
    const [, accession, stoichiometry] =
      /^([A-Z0-9]{6,10})(?:-[^(]*)?\((\d+)\)$/.exec(member) ?? []
    if (accession && stoichiometry) {
      counts.set(
        accession,
        (counts.get(accession) ?? 0) + Number(stoichiometry),
      )
    }
  }
  return counts
}

export function complexPairs(content: string, wanted: Set<string>) {
  const found = new Map<string, Complex[]>()
  for (const line of content.split('\n')) {
    const fields = line.split('\t')
    const [ac = '', name = ''] = fields
    const expanded = fields[18] ?? '-'
    const members = [
      ...participants(expanded === '-' ? (fields[4] ?? '') : expanded),
    ]
    for (const [i, [a, count]] of members.entries()) {
      for (const [b] of members.slice(i)) {
        const key = pairKey(a, b)
        if (
          ac.startsWith('CPX-') &&
          wanted.has(key) &&
          (a !== b || count > 1)
        ) {
          found.set(key, [...(found.get(key) ?? []), { ac, name }])
        }
      }
    }
  }
  return found
}

async function stringIds(accessions: string[]) {
  const chunks = Array.from(
    { length: Math.ceil(accessions.length / STRING_CHUNK) },
    (_, i) => accessions.slice(i * STRING_CHUNK, (i + 1) * STRING_CHUNK),
  )
  const results = await Promise.all(
    chunks.map(chunk =>
      getJson(
        STRING_IDS_URL,
        join(
          DATA,
          'string',
          `ids-${createHash('md5').update(chunk.join(' ')).digest('hex')}.json`,
        ),
        { identifiers: chunk.join('\r'), species: '9606', limit: '1' },
      ),
    ),
  )
  return new Map(
    results.flatMap(result =>
      records(result).flatMap(item => {
        const accession = text(item.queryItem)
        const id = text(item.stringId)
        return accession && id
          ? [[accession, id] satisfies [string, string]]
          : []
      }),
    ),
  )
}

export function readCrossrefs() {
  const data = record(readJson(CROSSREFS))
  return {
    complexes: new Map(
      Object.entries(record(data.complexes)).map(([key, value]) => [
        key,
        records(value).map(c => ({
          ac: text(c.ac) ?? '',
          name: text(c.name) ?? '',
        })),
      ]),
    ),
    string: new Map(
      Object.entries(record(data.string)).flatMap(([accession, id]) => {
        const value = text(id)
        return value ? [[accession, value] satisfies [string, string]] : []
      }),
    ),
    complexPortalDownloaded: text(data.complexPortalDownloaded) ?? '',
  }
}

async function main() {
  await download(COMPLEX_PORTAL_URL, COMPLEX_PORTAL)
  const atlas = readAtlas()
  const wanted = new Set(
    atlas.flatMap(protein =>
      protein.interfaces.flatMap(complex =>
        complex.partner ? [pairKey(protein.accession, complex.partner)] : [],
      ),
    ),
  )
  const accessions = [
    ...new Set([...wanted].flatMap(key => key.split(' '))),
  ].sort()
  const complexes = complexPairs(readFileSync(COMPLEX_PORTAL, 'utf8'), wanted)
  const string = await stringIds(accessions)
  writeJson(CROSSREFS, {
    complexPortalDownloaded: statSync(COMPLEX_PORTAL)
      .mtime.toISOString()
      .slice(0, 10),
    complexes: Object.fromEntries(complexes),
    string: Object.fromEntries(string),
  })
  console.log(
    `${complexes.size} of ${wanted.size} predicted pairs share a Complex Portal complex; ${string.size} of ${accessions.length} proteins map to STRING`,
  )
}

if (import.meta.main) {
  await main()
}
