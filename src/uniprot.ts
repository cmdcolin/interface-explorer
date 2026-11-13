import { join } from 'node:path'

import { getJson } from './cache.ts'
import { number, record, records, text } from './json.ts'
import type { ProteinContext } from './pairs.ts'
import { DATA } from './paths.ts'

const ENTRY_FIELDS =
  'accession,gene_primary,sequence,cc_alternative_products,ft_var_seq,xref_refseq,xref_mane-select'

export type UniProtEntry = Record<string, unknown>

const DISEASE_QUERY = 'organism_id:9606 AND reviewed:true AND cc_disease:*'

const FEATURE_FIELDS =
  'accession,ft_domain,ft_repeat,ft_zn_fing,ft_motif,ft_region,ft_coiled,ft_binding,ft_act_site,ft_site,keyword'

export const FEATURE_TYPES = [
  'Domain',
  'Repeat',
  'Zinc finger',
  'Motif',
  'Region',
  'Coiled coil',
  'Binding site',
  'Active site',
  'Site',
] as const

export const SITE_TYPES: FeatureType[] = ['Binding site', 'Active site', 'Site']

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
            description:
              text(feature.description) ||
              text(record(feature.ligand).name) ||
              '',
          } satisfies Feature,
        ]
      : []
  })
}

export function molecularFunctionsOf(entry: UniProtEntry) {
  return records(entry.keywords).flatMap(keyword => {
    const name = text(keyword.name)
    return keyword.category === 'Molecular function' && name ? [name] : []
  })
}

function diseaseAnnotations() {
  return uniprotEntries(
    DISEASE_QUERY,
    join(DATA, 'uniprot_disease_annotations.json'),
    FEATURE_FIELDS,
  )
}

export async function diseaseFeatures() {
  const entries = await diseaseAnnotations()
  return new Map(entries.map(entry => [accessionOf(entry), featuresOf(entry)]))
}

export async function diseaseFunctions() {
  const entries = await diseaseAnnotations()
  return new Map(
    entries.map(entry => [accessionOf(entry), molecularFunctionsOf(entry)]),
  )
}

export function diseasesOf(entry: UniProtEntry) {
  return records(entry.comments).flatMap(comment => {
    const disease = record(comment.disease)
    const name = text(disease.diseaseId)
    const reference = record(disease.diseaseCrossReference)
    const mim = text(reference.id)
    const note = text(record(records(record(comment.note).texts)[0]).value)
    return comment.commentType === 'DISEASE' &&
      note?.startsWith('The disease is caused by') &&
      name !== undefined &&
      reference.database === 'MIM' &&
      mim !== undefined
      ? [{ name, omim: `OMIM:${mim}` }]
      : []
  })
}

export async function humanDiseases() {
  const entries = await uniprotEntries(
    DISEASE_QUERY,
    join(DATA, 'uniprot_human_diseases.json'),
    'accession,cc_disease',
  )
  return new Map(entries.map(entry => [accessionOf(entry), diseasesOf(entry)]))
}

const CONTEXT_FIELDS = 'accession,protein_families,cc_subcellular_location'

export function contextOf(entry: UniProtEntry): ProteinContext {
  const comments = records(entry.comments)
  const similarity = comments.find(c => c.commentType === 'SIMILARITY')
  const sentence = text(record(records(similarity?.texts)[0]).value) ?? ''
  return {
    family: (sentence.split('.')[0] ?? '').replace(/^Belongs to the /, ''),
    locations: comments
      .filter(c => c.commentType === 'SUBCELLULAR LOCATION')
      .flatMap(c =>
        records(c.subcellularLocations).flatMap(
          l => text(record(l.location).value) ?? [],
        ),
      ),
  }
}

export async function humanContexts() {
  const entries = await uniprotEntries(
    'organism_id:9606 AND reviewed:true',
    join(DATA, 'uniprot_human_context.json'),
    CONTEXT_FIELDS,
  )
  return new Map(entries.map(entry => [accessionOf(entry), contextOf(entry)]))
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
