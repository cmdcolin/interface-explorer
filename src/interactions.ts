import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { readAtlas } from './atlasData.ts'
import { download } from './cache.ts'
import { isRecord, list, readJson, record, text, writeJson } from './json.ts'
import { DATA, OUT } from './paths.ts'

export const INTERACTIONS = join(OUT, 'interactions.json')
const INTACT_URL =
  'https://ftp.ebi.ac.uk/pub/databases/intact/current/psimitab/species/Human.zip'
const INTACT = join(DATA, 'intact', 'Human.zip')
const BIOGRID_URL =
  'https://downloads.thebiogrid.org/Download/BioGRID/Latest-Release/BIOGRID-ORGANISM-LATEST.tab3.zip'
const BIOGRID = join(DATA, 'biogrid', 'organism.tab3.zip')
const PSI_MI_URL =
  'https://raw.githubusercontent.com/HUPO-PSI/psi-mi-CV/master/psi-mi.obo'
const PSI_MI = join(DATA, 'psi-mi', 'psi-mi.obo')
const HUMAN = '9606'

export const EVIDENCE = ['direct', 'complex'] as const
export type Evidence = (typeof EVIDENCE)[number]

const TERMS = {
  association: 'MI:0914',
  directInteraction: 'MI:0407',
  complementation: 'MI:0090',
  biophysical: 'MI:0013',
  display: 'MI:0034',
  proximityLabelling: 'MI:1313',
  proximityLigation: 'MI:0813',
}

const BIOGRID_SYSTEMS = new Map<string, Evidence>([
  ['Two-hybrid', 'direct'],
  ['PCA', 'direct'],
  ['Reconstituted Complex', 'direct'],
  ['Co-crystal Structure', 'direct'],
  ['FRET', 'direct'],
  ['Far Western', 'direct'],
  ['Biochemical Activity', 'direct'],
  ['Protein-peptide', 'direct'],
  ['Surface Display', 'direct'],
  ['Affinity Capture-MS', 'complex'],
  ['Affinity Capture-Western', 'complex'],
  ['Affinity Capture-Luminescence', 'complex'],
  ['Co-fractionation', 'complex'],
  ['Co-purification', 'complex'],
  ['Cross-Linking-MS (XL-MS)', 'complex'],
])

export interface Report {
  accessions: [string, string]
  evidence: Evidence
  method: string
  publication: string
}

export interface PairEvidence {
  evidence: Evidence
  publications: string[]
  methods: string[]
}

export function pairKey(a: string, b: string) {
  return [a, b].sort().join(' ')
}

export function parseObo(content: string) {
  const parents = new Map<string, string[]>()
  for (const stanza of content.split(/\n(?=\[)/)) {
    const id = /^id: (MI:\d+)$/m.exec(stanza)?.[1]
    if (stanza.startsWith('[Term]') && id) {
      parents.set(
        id,
        [...stanza.matchAll(/^is_a: (MI:\d+)/gm)].flatMap(m => m[1] ?? []),
      )
    }
  }
  return parents
}

export function descendsFrom(
  parents: Map<string, string[]>,
  term: string,
  ancestor: string,
): boolean {
  return (
    term === ancestor ||
    (parents.get(term) ?? []).some(parent =>
      descendsFrom(parents, parent, ancestor),
    )
  )
}

function miTerm(field: string) {
  const [, id = '', name = ''] = /"(MI:\d+)"\(([^)]*)\)/.exec(field) ?? []
  return { id, name }
}

function uniprotOf(field: string) {
  return /^uniprotkb:([A-Z0-9]{6,10})(?:-|$)/.exec(field)?.[1]
}

function isHuman(field: string) {
  return field.split('|').some(taxon => taxon.startsWith(`taxid:${HUMAN}(`))
}

export function publicationOf(field: string) {
  const ids = field.split('|')
  const pubmed = ids.find(id => /^pubmed:\d+$/i.test(id))
  return pubmed ? pubmed.replace(/^pubmed:/i, '') : (ids[0] ?? '')
}

export function intactReport(
  fields: string[],
  parents: Map<string, string[]>,
): Report | undefined {
  const a = uniprotOf(fields[0] ?? '')
  const b = uniprotOf(fields[1] ?? '')
  const method = miTerm(fields[6] ?? '')
  const type = miTerm(fields[11] ?? '')
  const within = (term: string, ...ancestors: string[]) =>
    ancestors.some(ancestor => descendsFrom(parents, term, ancestor))
  return a &&
    b &&
    a !== b &&
    isHuman(fields[9] ?? '') &&
    isHuman(fields[10] ?? '') &&
    fields[35] !== 'true' &&
    within(type.id, TERMS.association) &&
    !within(method.id, TERMS.proximityLabelling, TERMS.proximityLigation)
    ? {
        accessions: [a, b],
        evidence:
          within(type.id, TERMS.directInteraction) ||
          within(
            method.id,
            TERMS.complementation,
            TERMS.biophysical,
            TERMS.display,
          )
            ? 'direct'
            : 'complex',
        method: method.name,
        publication: publicationOf(fields[8] ?? ''),
      }
    : undefined
}

export function biogridReports(fields: string[]): Report[] {
  const evidence = BIOGRID_SYSTEMS.get(fields[11] ?? '')
  const accessionsOf = (field = '') =>
    field === '-' ? [] : field.split('|').filter(Boolean)
  const [publicationType = '', publication = ''] = (fields[14] ?? '').split(':')
  return evidence &&
    fields[12] === 'physical' &&
    fields[15] === HUMAN &&
    fields[16] === HUMAN
    ? accessionsOf(fields[23]).flatMap(a =>
        accessionsOf(fields[26]).flatMap(b =>
          a === b
            ? []
            : [
                {
                  accessions: [a, b] satisfies [string, string],
                  evidence,
                  method: fields[11] ?? '',
                  publication:
                    publicationType === 'PUBMED'
                      ? publication
                      : `${publicationType.toLowerCase()}:${publication}`,
                },
              ],
        ),
      )
    : []
}

export async function collect(
  reports: AsyncIterable<Report> | Iterable<Report>,
  wanted: Set<string>,
) {
  const found = new Map<
    string,
    { direct: boolean; publications: Set<string>; methods: Set<string> }
  >()
  for await (const report of reports) {
    const key = pairKey(...report.accessions)
    if (wanted.has(key)) {
      const pair = found.get(key) ?? {
        direct: false,
        publications: new Set<string>(),
        methods: new Set<string>(),
      }
      pair.direct ||= report.evidence === 'direct'
      pair.publications.add(report.publication)
      pair.methods.add(report.method)
      found.set(key, pair)
    }
  }
  return new Map(
    [...found].map(([key, pair]) => [
      key,
      {
        evidence: pair.direct ? 'direct' : 'complex',
        publications: [...pair.publications].sort(),
        methods: [...pair.methods].sort(),
      } satisfies PairEvidence,
    ]),
  )
}

function zipEntries(path: string) {
  return spawnSync('unzip', ['-Z1', path], { encoding: 'utf8' })
    .stdout.split('\n')
    .filter(Boolean)
}

async function* zipRows(path: string, entry: string) {
  const unzip = spawn('unzip', ['-p', path, entry])
  for await (const line of createInterface({ input: unzip.stdout })) {
    if (!line.startsWith('#')) {
      yield line.split('\t')
    }
  }
}

async function* reports(parents: Map<string, string[]>) {
  for (const entry of zipEntries(INTACT)) {
    for await (const fields of zipRows(INTACT, entry)) {
      const report = intactReport(fields, parents)
      if (report) {
        yield report
      }
    }
  }
  for (const entry of zipEntries(BIOGRID).filter(name =>
    name.includes('Homo_sapiens'),
  )) {
    for await (const fields of zipRows(BIOGRID, entry)) {
      yield* biogridReports(fields)
    }
  }
}

function dateOf(path: string) {
  return statSync(path).mtime.toISOString().slice(0, 10)
}

export function readInteractions() {
  const pairs = record(record(readJson(INTERACTIONS)).pairs)
  const strings = (value: unknown) => list(value).flatMap(v => text(v) ?? [])
  return new Map(
    Object.entries(pairs).flatMap(([key, value]) => {
      const evidence = EVIDENCE.find(
        e => isRecord(value) && e === value.evidence,
      )
      return evidence
        ? [
            [
              key,
              {
                evidence,
                publications: strings(record(value).publications),
                methods: strings(record(value).methods),
              } satisfies PairEvidence,
            ],
          ]
        : []
    }),
  )
}

export function readSources() {
  return record(record(readJson(INTERACTIONS)).sources)
}

async function main() {
  await Promise.all([
    download(INTACT_URL, INTACT),
    download(BIOGRID_URL, BIOGRID),
    download(PSI_MI_URL, PSI_MI),
  ])
  const parents = parseObo(readFileSync(PSI_MI, 'utf8'))
  const wanted = new Set(
    readAtlas().flatMap(protein =>
      protein.interfaces.flatMap(complex =>
        complex.partner ? [pairKey(protein.accession, complex.partner)] : [],
      ),
    ),
  )
  const found = await collect(reports(parents), wanted)
  const biogridRelease = zipEntries(BIOGRID)
    .map(name => /Homo_sapiens-([\d.]+)\.tab3/.exec(name)?.[1])
    .find(Boolean)
  writeJson(INTERACTIONS, {
    sources: {
      intactDownloaded: dateOf(INTACT),
      biogridRelease,
    },
    pairs: Object.fromEntries(found),
  })
  const count = (evidence: Evidence) =>
    [...found.values()].filter(p => p.evidence === evidence).length
  console.log(
    `${wanted.size} predicted pairs: ${count('direct')} with direct evidence, ${count('complex')} with same-complex evidence only, ${wanted.size - found.size} with none`,
  )
}

if (import.meta.main) {
  await main()
}
