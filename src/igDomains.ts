import { join } from 'node:path'

import { number, record, records, text, writeJson } from './json.ts'
import { DATA, SITE_DATA } from './paths.ts'
import { compareText, editsByIsoform } from './sequences.ts'
import { accessionOf, geneOf, uniprotEntries } from './uniprot.ts'
import type { UniProtEntry } from './uniprot.ts'

const WHOLE = 0.9

export interface IgDomain {
  start: number
  end: number
  name: string
}

export function igDomains(entry: UniProtEntry): IgDomain[] {
  return records(entry.features).flatMap(feature => {
    const location = record(feature.location)
    const start = number(record(location.start).value)
    const end = number(record(location.end).value)
    const name = text(feature.description) ?? ''
    return feature.type === 'Domain' &&
      name.includes('Ig-like') &&
      start !== undefined &&
      end !== undefined
      ? [{ start, end, name }]
      : []
  })
}

export function deletions(edits: [number, number, string][]) {
  return edits
    .filter(([, , replacement]) => replacement === '')
    .map(([start, end]) => [start, end] as [number, number])
}

export function lostDomains(domains: IgDomain[], removed: [number, number][]) {
  return domains.flatMap((domain, index) => {
    const length = domain.end - domain.start + 1
    const overlap = removed.reduce(
      (sum, [start, end]) =>
        sum +
        Math.max(
          0,
          Math.min(end, domain.end) - Math.max(start, domain.start) + 1,
        ),
      0,
    )
    return overlap >= WHOLE * length ? [index] : []
  })
}

export function igRecord(entry: UniProtEntry) {
  const domains = igDomains(entry)
  const isoforms = [...editsByIsoform(entry)]
    .filter(([, isoform]) => !isoform.displayed)
    .map(([accession, isoform]) => {
      const removed = deletions(isoform.edits)
      return {
        accession,
        name: isoform.name,
        removed,
        lost: lostDomains(domains, removed),
      }
    })
  return {
    gene: geneOf(entry),
    accession: accessionOf(entry),
    length: text(record(entry.sequence).value)?.length ?? 0,
    domains,
    isoforms,
  }
}

export function igTotals(records: ReturnType<typeof igRecord>[]) {
  const withDomains = records.filter(r => r.domains.length > 0)
  const losing = withDomains.filter(r =>
    r.isoforms.some(i => i.lost.length > 0),
  )
  return {
    genes: withDomains.length,
    genesLosingDomain: losing.length,
    isoformsLosingDomain: losing.reduce(
      (n, r) => n + r.isoforms.filter(i => i.lost.length > 0).length,
      0,
    ),
  }
}

async function main() {
  const entries = await uniprotEntries(
    'organism_id:9606 AND reviewed:true AND cc_alternative_products:*',
    join(DATA, 'uniprot_ig_isoforms.json'),
    'accession,gene_primary,ft_domain,ft_var_seq,cc_alternative_products,sequence',
  )
  const all = entries.map(igRecord)
  const losing = all
    .filter(r => r.isoforms.some(i => i.lost.length > 0))
    .sort((a, b) => compareText(a.gene, b.gene))
  writeJson(join(SITE_DATA, 'igIsoforms.json'), {
    ...igTotals(all),
    records: losing,
  })
  console.log(igTotals(all))
}

if (import.meta.main) {
  await main()
}
