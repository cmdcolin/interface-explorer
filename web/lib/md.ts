import { md } from './data.ts'
import { clinvarHref, esc } from './html.ts'
import type { SceneModel, ScenePartner, SceneVariant } from './scene.ts'

const UNIPROT_CHAIN = 'A'
const ABSENT_CHAIN = 'B'

function mostPaired(pairs: { residues: [number, number] }[]) {
  const counts = Map.groupBy(pairs.flatMap(pair => pair.residues), r => r)
  return [...counts].toSorted((a, b) => b[1].length - a[1].length)[0]?.[0] ?? 0
}

function round(value: number, digits = 2) {
  return value.toFixed(digits)
}

function pValue(p: number) {
  return p < 0.001 ? '< 0.001' : `= ${p < 0.01 ? round(p, 3) : round(p)}`
}

export function switchView() {
  const data = md()
  const partner: ScenePartner = {
    gene: data.gene,
    entity: data.accession,
    chain: UNIPROT_CHAIN,
    residues: data.residues.map(r => r.position),
  }
  const variants: SceneVariant[] = data.residues.flatMap(r =>
    r.variants
      .filter(v => v.label !== 'benign')
      .map(v => ({ change: v.change, label: v.label, position: r.position, partners: [data.gene] })),
  )
  const model: SceneModel = { url: data.model, partnerChain: ABSENT_CHAIN, up: data.axis }
  return { partner, variants, model }
}

export function mdPost() {
  const data = md()
  const named = (label: string) =>
    data.residues.flatMap(r => r.variants.filter(v => v.label === label).map(v => ({ ...v, residue: r.name })))
  const link = (v: { change: string; variation: number }) => `<a href="${clinvarHref(v.variation)}">${esc(v.change)}</a>`
  const hub = mostPaired(data.pairs)
  const stretch = data.pairs
    .filter(pair => pair.residues.includes(hub))
    .flatMap(pair => pair.residues)
    .filter(r => r < hub)
  const [first = 0, last = 0] = [Math.min(...stretch), Math.max(...stretch)]
  const inStretch = data.residues.filter(r => r.position >= first && r.position <= last)
  const top = data.pairs[0]
  const nameOf = (position: number) => data.residues.find(r => r.position === position)?.name ?? String(position)
  return {
    ...data,
    switches: data.residues.length,
    tested: data.background.tested,
    ordered: data.background.residues,
    phylop: round(data.tests.phylop.observed),
    phylopBackground: round(data.background.phylop),
    phylopP: pValue(data.tests.phylop.p),
    alphaMissense: round(data.tests.alphaMissense.observed),
    alphaMissenseBackground: round(data.background.alphaMissense),
    alphaMissenseP: pValue(data.tests.alphaMissense.p),
    burial: round(data.tests.burial.observed, 1),
    burialBackground: round(data.background.burial, 1),
    pathogenicOn: data.tests.pathogenic.observed,
    pathogenicP: pValue(data.tests.pathogenic.p),
    pathogenicNearby: data.tests.pathogenicNearby.observed,
    pathogenicNearbyP: pValue(data.tests.pathogenicNearby.p),
    pathogenicTotal: data.background.pathogenic,
    uncertainOn: data.tests.uncertain.observed,
    uncertainP: pValue(data.tests.uncertain.p),
    pathogenicLinks: named('pathogenic').map(link).join(', '),
    uncertainLinks: named('uncertain').map(link).join(', '),
    hub: nameOf(hub),
    hubPlddt: data.residues.find(r => r.position === hub)?.plddt ?? 0,
    stretch: `${nameOf(first)}–${nameOf(last)}`,
    stretchUncertain: inStretch.filter(r => r.variants.some(v => v.label === 'uncertain')).length,
    top: top ? { from: nameOf(top.residues[0]), to: nameOf(top.residues[1]), c1: top.c1, c2: top.c2, change: top.change } : undefined,
    pairCount: data.pairs.length,
    localCount: data.local.length,
    tableHtml: switchTable(),
  }
}

function switchTable() {
  const data = md()
  const rows = data.residues
    .map(r => {
      const variants = r.variants
        .filter(v => v.label !== 'benign')
        .map(v => `<a class="count ${v.label}" href="${clinvarHref(v.variation)}">${esc(v.change)}</a>`)
        .join(' ')
      const kind = r.kind === 'pair' ? 'distance' : r.kind === '3di' ? '3Di' : 'both'
      return `<tr><td>${esc(r.name)}</td><td>${kind}</td><td class="num">${r.phylop === null ? '—' : round(r.phylop)}</td><td class="num">${r.alphaMissense === null ? '—' : round(r.alphaMissense)}</td><td class="num">${Math.round(r.plddt)}</td><td>${variants || '<span class="muted">—</span>'}</td></tr>`
    })
    .join('')
  return `<div class="table-wrap"><table><thead><tr><th>Residue</th><th>Switch</th><th class="num">phyloP</th><th class="num">AlphaMissense</th><th class="num">pLDDT</th><th>ClinVar (pathogenic, uncertain)</th></tr></thead><tbody>${rows}</tbody></table></div>`
}
