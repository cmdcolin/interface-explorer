import { join } from 'node:path'

import { number, record, records, text, writeJson } from './json.ts'
import { DATA, SITE_DATA } from './paths.ts'
import { compareText, editsByIsoform } from './sequences.ts'
import { accessionOf, geneOf, uniprotEntries } from './uniprot.ts'
import type { UniProtEntry } from './uniprot.ts'

const WHOLE = 0.9

const IG_QUERY =
  'organism_id:9606 AND reviewed:true AND cc_alternative_products:*'

export interface IgDomain {
  start: number
  end: number
  name: string
}

export interface SignalPeptide {
  start: number
  end: number
}

function spanOf(feature: Record<string, unknown>) {
  const location = record(feature.location)
  return {
    start: number(record(location.start).value),
    end: number(record(location.end).value),
  }
}

export function signalPeptide(entry: UniProtEntry) {
  return records(entry.features).flatMap(feature => {
    const { start, end } = spanOf(feature)
    return feature.type === 'Signal' && start !== undefined && end !== undefined
      ? [{ start, end }]
      : []
  })[0]
}

export function truncatesSignal(
  signal: SignalPeptide | undefined,
  removed: [number, number][],
) {
  return (
    signal !== undefined &&
    removed.some(([start, end]) => start <= signal.end && end >= signal.start)
  )
}

export function igDomains(entry: UniProtEntry): IgDomain[] {
  return records(entry.features).flatMap(feature => {
    const { start, end } = spanOf(feature)
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

export function igRecord(entry: UniProtEntry, signal?: SignalPeptide) {
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
        signalTruncated: truncatesSignal(signal, removed),
      }
    })
  return {
    gene: geneOf(entry),
    accession: accessionOf(entry),
    length: text(record(entry.sequence).value)?.length ?? 0,
    signal,
    domains,
    isoforms,
  }
}

export function igTotals(records: ReturnType<typeof igRecord>[]) {
  const withDomains = records.filter(r => r.domains.length > 0)
  const losing = withDomains.filter(r =>
    r.isoforms.some(i => i.lost.length > 0),
  )
  const lost = losing.flatMap(r => r.isoforms.filter(i => i.lost.length > 0))
  return {
    genes: withDomains.length,
    genesLosingDomain: losing.length,
    isoformsLosingDomain: lost.length,
    isoformsTruncatingSignal: lost.filter(i => i.signalTruncated).length,
    genesTruncatingSignal: losing.filter(r =>
      r.isoforms.some(i => i.lost.length > 0 && i.signalTruncated),
    ).length,
  }
}

async function main() {
  const entries = await uniprotEntries(
    IG_QUERY,
    join(DATA, 'uniprot_ig_isoforms.json'),
    'accession,gene_primary,ft_domain,ft_var_seq,cc_alternative_products,sequence',
  )
  const signalEntries = await uniprotEntries(
    IG_QUERY,
    join(DATA, 'uniprot_ig_signals.json'),
    'accession,ft_signal',
  )
  const signals = new Map(
    signalEntries.map(entry => [accessionOf(entry), signalPeptide(entry)]),
  )
  const all = entries.map(entry =>
    igRecord(entry, signals.get(accessionOf(entry))),
  )
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
