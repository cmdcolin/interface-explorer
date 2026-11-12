import { join } from 'node:path'

import { getJson } from './cache.ts'
import { number, record, records, text } from './json.ts'
import { DATA } from './paths.ts'

const ENTRY_FIELDS =
  'accession,gene_primary,sequence,cc_alternative_products,ft_var_seq,xref_refseq,xref_mane-select'

export type UniProtEntry = Record<string, unknown>

const DISEASE_QUERY = 'organism_id:9606 AND reviewed:true AND cc_disease:*'

const FEATURE_FIELDS =
  'accession,ft_domain,ft_repeat,ft_zn_fing,ft_motif,ft_region,ft_coiled'

export const FEATURE_TYPES = [
  'Domain',
  'Repeat',
  'Zinc finger',
  'Motif',
  'Region',
  'Coiled coil',
] as const

export type FeatureType = (typeof FEATURE_TYPES)[number]

export interface Feature {
  type: FeatureType
  start: number
  end: number
  description: string
}

async function uniprotEntries(
  query: string,
  path: string,
  fields = ENTRY_FIELDS,
) {
  const stream = await getJson(
    'https://rest.uniprot.org/uniprotkb/stream',
    path,
    { query, fields, format: 'json' },
  )
  return records(record(stream).results)
}

export function diseaseEntries() {
  return uniprotEntries(DISEASE_QUERY, join(DATA, 'uniprot_disease.json'))
}

function featureType(value: unknown) {
  return FEATURE_TYPES.find(type => type === value)
}

export function featuresOf(entry: UniProtEntry) {
  return records(entry.features).flatMap(feature => {
    const type = featureType(feature.type)
    const location = record(feature.location)
    const start = number(record(location.start).value)
    const end = number(record(location.end).value)
    return type && start !== undefined && end !== undefined
      ? [
          {
            type,
            start,
            end,
            description: text(feature.description) ?? '',
          } satisfies Feature,
        ]
      : []
  })
}

export async function diseaseFeatures() {
  const entries = await uniprotEntries(
    DISEASE_QUERY,
    join(DATA, 'uniprot_disease_features.json'),
    FEATURE_FIELDS,
  )
  return new Map(entries.map(entry => [accessionOf(entry), featuresOf(entry)]))
}

export function humanEntries() {
  return uniprotEntries(
    'organism_id:9606 AND reviewed:true',
    join(DATA, 'uniprot_human.json'),
  )
}

export function accessionOf(entry: UniProtEntry) {
  return text(entry.primaryAccession) ?? ''
}

export function geneOf(entry: UniProtEntry) {
  return text(record(record(records(entry.genes)[0]).geneName).value) ?? ''
}

export function sequenceOf(entry: UniProtEntry) {
  return text(record(entry.sequence).value) ?? ''
}
