import { createReadStream, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

import { download } from './cache.ts'
import { CLINICAL_SIGNIFICANCE, SUMMARY } from './clinvar.ts'
import { writeJson } from './json.ts'
import { DATA, OUT } from './paths.ts'
import { humanDiseases } from './uniprot.ts'

const HPOA_URL = 'https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa'
const HPOA = join(DATA, 'hpo', 'phenotype.hpoa')
const CLINGEN_URL =
  'https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv'
const CLINGEN = join(DATA, 'clingen', 'ClinGen_gene_curation_list_GRCh38.tsv')
export const MECHANISM = join(OUT, 'mechanism.json')

export type Inheritance = 'dominant' | 'recessive'
export const INHERITANCES: Inheritance[] = ['dominant', 'recessive']
export type GeneClass = 'missense-only' | 'truncation-pathogenic'

const MODES = new Map<string, Inheritance>([
  ['HP:0000006', 'dominant'],
  ['HP:0000007', 'recessive'],
])
const INHERITANCE_ASPECT = 'I'
const NOT_HAPLOINSUFFICIENT = new Set([0, 1, 40])

export function parseInheritance(hpoa: string) {
  const modes = new Map<string, Set<Inheritance>>()
  for (const line of hpoa.split('\n')) {
    const [disease = '', , , hpo = '', , , , , , , aspect] = line.split('\t')
    const mode = MODES.get(hpo)
    if (mode && aspect === INHERITANCE_ASPECT) {
      modes.set(disease, (modes.get(disease) ?? new Set()).add(mode))
    }
  }
  return new Map(
    [...modes].flatMap(([disease, found]) =>
      found.size === 1
        ? [...found].map(
            mode => [disease, mode] satisfies [string, Inheritance],
          )
        : [],
    ),
  )
}

export function variantInheritance(
  diseases: string[],
  modes: Map<string, Inheritance>,
) {
  const found = new Set(diseases.flatMap(d => modes.get(d) ?? []))
  return found.size === 1 ? [...found][0] : undefined
}

export function parseHaploinsufficiency(tsv: string) {
  return new Map(
    tsv
      .split('\n')
      .filter(line => line && !line.startsWith('#'))
      .flatMap(line => {
        const [gene = '', , , , score = ''] = line.split('\t')
        return score === '' || Number.isNaN(Number(score))
          ? []
          : [[gene, Number(score)] satisfies [string, number]]
      }),
  )
}

export function isTruncating(name: string) {
  return /Ter\)$/.test(name) || /fs/.test(name)
}

export function geneClass(truncations: number): GeneClass | undefined {
  return truncations === 0
    ? 'missense-only'
    : truncations >= 2
      ? 'truncation-pathogenic'
      : undefined
}

async function truncationCounts() {
  const counts = new Map<string, number>()
  let columns: Map<string, number> | undefined
  for await (const line of createInterface({
    input: createReadStream(SUMMARY).pipe(createGunzip()),
    crlfDelay: Infinity,
  })) {
    const fields = line.split('\t')
    if (columns) {
      const index = columns
      const field = (name: string) => fields[index.get(name) ?? -1] ?? ''
      const significance = field('ClinicalSignificance').split(';')[0] ?? ''
      if (
        field('Assembly') === 'GRCh38' &&
        CLINICAL_SIGNIFICANCE.get(significance) === 'pathogenic'
      ) {
        for (const gene of field('GeneSymbol').split(';')) {
          counts.set(
            gene,
            (counts.get(gene) ?? 0) + (isTruncating(field('Name')) ? 1 : 0),
          )
        }
      }
    } else {
      columns = new Map(fields.map((name, i) => [name, i]))
    }
  }
  return counts
}

export interface Mechanism {
  genes: Record<string, { class?: GeneClass; haploinsufficiency?: number }>
  inheritance: Record<string, Inheritance>
}

export function readMechanism() {
  const mechanism: Mechanism = JSON.parse(readFileSync(MECHANISM, 'utf8'))
  return mechanism
}

export async function proteinInheritance() {
  const modes = new Map(Object.entries(readMechanism().inheritance))
  const diseases = await humanDiseases()
  return new Map(
    [...diseases].flatMap(([accession, list]) => {
      const mode = variantInheritance(
        list.map(d => d.omim),
        modes,
      )
      return mode ? [[accession, mode] satisfies [string, Inheritance]] : []
    }),
  )
}

export function notHaploinsufficient(score: number | undefined) {
  return score !== undefined && NOT_HAPLOINSUFFICIENT.has(score)
}

export async function main() {
  await download(HPOA_URL, HPOA)
  await download(CLINGEN_URL, CLINGEN)
  const inheritance = parseInheritance(readFileSync(HPOA, 'utf8'))
  const haploinsufficiency = parseHaploinsufficiency(
    readFileSync(CLINGEN, 'utf8'),
  )
  const truncations = await truncationCounts()
  const genes = Object.fromEntries(
    [...new Set([...truncations.keys(), ...haploinsufficiency.keys()])].map(
      gene => [
        gene,
        {
          class: geneClass(truncations.get(gene) ?? 0),
          haploinsufficiency: haploinsufficiency.get(gene),
        },
      ],
    ),
  )
  writeJson(MECHANISM, { genes, inheritance: Object.fromEntries(inheritance) })
  const classes = Object.values(genes)
  console.log(
    `${classes.filter(g => g.class === 'missense-only').length} missense-only genes, ${classes.filter(g => g.class === 'truncation-pathogenic').length} truncation-pathogenic; ${inheritance.size} diseases with one inheritance mode`,
  )
}

if (import.meta.main) {
  await main()
}
