import { alphaMissenseEvidence } from '../../src/constants.ts'
import { gene, geneRows, leadRows } from './data.ts'
import { evidenceText, percent } from './html.ts'
import type { Gene, GeneVariant } from './types.ts'

const LITERATURE_OFFSET: Record<string, { offset: number; reason: string }> = {
  SOD1: { offset: 1, reason: 'which does not count the first methionine' },
  TTR: {
    offset: 20,
    reason: 'which numbers the mature protein, after its signal peptide',
  },
}

function homodimerOf(g: Gene) {
  return g.partners.find(p => p.homodimer)
}

function touchesItself(g: Gene, v: GeneVariant) {
  const own = homodimerOf(g)
  return own !== undefined && v.partners.includes(own.gene)
}

function pp3(variants: GeneVariant[]) {
  const scored = variants.flatMap(v =>
    v.alphaMissense === undefined ? [] : [v.alphaMissense],
  )
  const reached = scored.filter(
    score => alphaMissenseEvidence(score).points > 0,
  ).length
  return {
    scored: scored.length,
    reached,
    missed: scored.length - reached,
    share: percent(reached, scored.length),
  }
}

function confirms(e: { experimental: number; shared: number }) {
  return e.experimental > 0 && e.shared >= e.experimental / 2
}

function literatureName(name: string, change: string, position: number) {
  const shift = LITERATURE_OFFSET[name]
  return shift
    ? `${change.charAt(0)}${position - shift.offset}${change.slice(-1)}`
    : change
}

function story(name: string, highlight: string) {
  const record = gene(name)
  const own = homodimerOf(record)
  const pathogenic = record.variants.filter(
    v => v.label === 'pathogenic' && touchesItself(record, v),
  )
  const variant = record.variants.find(v => v.change === highlight)
  return {
    gene: record.gene,
    page: record.page,
    residues: own?.residues ?? 0,
    ipsae: own?.ipsae?.toFixed(2) ?? '',
    experiment: own?.experiment,
    pathogenic: pathogenic.length,
    total: record.totals.pathogenic,
    alphaMissense: pp3(pathogenic),
    highlight: variant
      ? {
          change: variant.change,
          literature: literatureName(name, variant.change, variant.position),
          reason: LITERATURE_OFFSET[name]?.reason ?? '',
          score: variant.alphaMissense?.toFixed(2) ?? '—',
          evidence:
            variant.alphaMissense === undefined
              ? 'unscored'
              : evidenceText(variant.alphaMissense),
          position: variant.position,
        }
      : undefined,
  }
}

export function itselfPost() {
  const genes = geneRows().map(row => gene(row.page))
  const withHomodimer = genes.filter(g => homodimerOf(g))
  const onlyItself = genes.filter(
    g => g.partners.length > 0 && g.partners.every(p => p.homodimer),
  )
  const checked = withHomodimer.flatMap(g => homodimerOf(g)?.experiment ?? [])
  const pathogenic = (atItself: boolean) =>
    genes.flatMap(g =>
      g.variants.filter(
        v => v.label === 'pathogenic' && touchesItself(g, v) === atItself,
      ),
    )
  const leads = leadRows().filter(lead => lead.partners.includes(lead.gene))
  return {
    withHomodimer: withHomodimer.length,
    onlyItself: onlyItself.length,
    checked: checked.length,
    confirmed: checked.filter(confirms).length,
    itself: pp3(pathogenic(true)),
    others: pp3(pathogenic(false)),
    leads: leads.length,
    leadGenes: new Set(leads.map(lead => lead.gene)).size,
    sod1: story('SOD1', 'I114T'),
    ttr: story('TTR', 'V142I'),
  }
}
