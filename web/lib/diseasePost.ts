import { disease, diseaseRows } from './data.ts'
import { diseaseHref, geneHref } from './site.ts'

function named(name: string) {
  const row = diseaseRows().find(r => r.name === name)
  return row ? { ...disease(row.page), href: diseaseHref(row.page) } : undefined
}

function pairOf(name: string, gene: string, partner: string) {
  const found = named(name)
  const pair = found?.pairs.find(p => p.gene === gene && p.partner === partner)
  return found && pair
    ? {
        ...pair,
        disease: found.name,
        diseaseHref: found.href,
        seriesSize: found.seriesSize,
        href: `${geneHref(pair.page)}?partner=${encodeURIComponent(pair.partner)}`,
      }
    : undefined
}

export function diseasePost() {
  const rows = diseaseRows()
  const withPairs = rows.filter(r => r.pairs > 0)
  const seriesWithPairs = withPairs.flatMap(r =>
    r.seriesSize === undefined ? [] : [r.seriesSize],
  )
  const complexI = named('mitochondrial complex I deficiency, nuclear type')
  return {
    diseases: rows.length,
    series: rows.filter(r => r.seriesSize !== undefined).length,
    withPairs: withPairs.length,
    pairs: withPairs.reduce((n, r) => n + r.pairs, 0),
    seriesPairs: withPairs.reduce(
      (n, r) => n + (r.seriesSize === undefined ? 0 : r.pairs),
      0,
    ),
    smallestSeries: Math.min(...seriesWithPairs),
    largestSeries: Math.max(...seriesWithPairs),
    complexI: complexI && {
      href: complexI.href,
      genes: complexI.genes.length,
      pairs: complexI.pairs.length,
      seriesSize: complexI.seriesSize,
    },
    ndufv: pairOf(
      'mitochondrial complex I deficiency, nuclear type',
      'NDUFV2',
      'NDUFV1',
    ),
    mismatch: pairOf('mismatch repair cancer syndrome', 'MLH1', 'PMS2'),
    noonan: pairOf('Noonan syndrome', 'KRAS', 'SOS1'),
  }
}
