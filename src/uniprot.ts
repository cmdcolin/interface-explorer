import { join } from 'node:path'

import { getJson } from './cache.ts'
import { record, records, text } from './json.ts'
import { DATA } from './paths.ts'

const ENTRY_FIELDS =
  'accession,gene_primary,sequence,cc_alternative_products,ft_var_seq,xref_refseq,xref_mane-select'

export type UniProtEntry = Record<string, unknown>

async function uniprotEntries(query: string, path: string) {
  const stream = await getJson(
    'https://rest.uniprot.org/uniprotkb/stream',
    path,
    { query, fields: ENTRY_FIELDS, format: 'json' },
  )
  return records(record(stream).results)
}

export function diseaseEntries() {
  return uniprotEntries(
    'organism_id:9606 AND reviewed:true AND cc_disease:*',
    join(DATA, 'uniprot_disease.json'),
  )
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
