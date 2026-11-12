import { join } from 'node:path'

import { getText } from './cache.ts'
import { DATA } from './paths.ts'

const MONDO_URL = 'https://purl.obolibrary.org/obo/mondo.obo'

export interface Term {
  name: string
  parents: string[]
  omim: string[]
}

export interface Disease {
  name: string
  omim: string
}

function crossReference(id: string) {
  return id.startsWith('OMIMPS:')
    ? `OMIM:PS${id.slice('OMIMPS:'.length)}`
    : id.startsWith('OMIM:')
      ? id
      : undefined
}

export function parseObo(obo: string) {
  const terms = new Map<string, Term>()
  for (const stanza of obo.split('\n\n')) {
    const lines = stanza.trim().split('\n')
    const values = (tag: string) =>
      lines.flatMap(line =>
        line.startsWith(`${tag}: `)
          ? [line.slice(tag.length + 2).split(' ')[0] ?? '']
          : [],
      )
    const id = values('id')[0]
    const name = lines.find(line => line.startsWith('name: '))?.slice(6)
    if (
      lines[0] === '[Term]' &&
      id?.startsWith('MONDO:') &&
      name !== undefined &&
      !lines.includes('is_obsolete: true')
    ) {
      terms.set(id, {
        name,
        parents: values('is_a'),
        omim: values('xref').flatMap(x => crossReference(x) ?? []),
      })
    }
  }
  return terms
}

export function diseaseOntology(terms: Map<string, Term>) {
  const byOmim = new Map<string, string[]>()
  for (const [id, term] of terms) {
    for (const omim of term.omim) {
      byOmim.set(omim, [...(byOmim.get(omim) ?? []), id])
    }
  }
  const name = (id: string) => terms.get(id)?.name ?? id
  const isSeries = (id: string) =>
    terms.get(id)?.omim.some(x => x.startsWith('OMIM:PS')) ?? false
  const seriesOf = (id: string) =>
    isSeries(id) ? [id] : (terms.get(id)?.parents.filter(isSeries) ?? [])
  const resolve = (ids: string[]) => [
    ...new Set(
      ids.flatMap(id =>
        id.startsWith('MONDO:')
          ? terms.has(id)
            ? [id]
            : []
          : (byOmim.get(id) ?? []),
      ),
    ),
  ]
  const members = new Map<string, number>()
  for (const [id, term] of terms) {
    if (!isSeries(id) && term.omim.length > 0) {
      for (const series of term.parents.filter(isSeries)) {
        members.set(series, (members.get(series) ?? 0) + 1)
      }
    }
  }
  const size = (id: string) => members.get(id) ?? 0
  const shared = (variantIds: string[], diseases: Disease[]) => {
    const own = new Set(resolve(variantIds))
    const ownSeries = new Set([...own].flatMap(seriesOf))
    return diseases.flatMap(disease => {
      const theirs = resolve([disease.omim])
      const series = theirs
        .flatMap(seriesOf)
        .filter(id => ownSeries.has(id))
        .sort((a, b) => size(a) - size(b))[0]
      return theirs.some(id => own.has(id))
        ? [{ disease: disease.name }]
        : series
          ? [
              {
                disease: disease.name,
                series: { name: name(series), size: size(series) },
              },
            ]
          : []
    })
  }
  const concepts = (ids: string[]) => {
    const own = resolve(ids)
    return [...new Set([...own, ...own.flatMap(seriesOf)])]
  }
  return { shared, concepts, name, size, isSeries }
}

export type DiseaseOntology = ReturnType<typeof diseaseOntology>

export type SharedDisease = ReturnType<
  ReturnType<typeof diseaseOntology>['shared']
>[number]

export async function readOntology() {
  return diseaseOntology(
    parseObo(await getText(MONDO_URL, join(DATA, 'mondo.obo.gz'))),
  )
}
