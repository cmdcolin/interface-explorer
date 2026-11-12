import { LABEL_KEYS, LABELS, esc, percent } from './html.ts'
import { geneHref } from './site.ts'
import type {
  Enrichment,
  GeneRow,
  Label,
  ResidueConservation,
  Summary,
  Validation,
} from './types.ts'

const ODDS = 'Mantel–Haenszel odds ratio'
const INTERVAL = '95% CI (bootstrap over proteins)'
const FOREST = { min: 0.3, max: 5.5, ticks: [0.5, 1, 2, 4] }

export function odds(e: Enrichment) {
  return e[ODDS]
}

export function oddsText(e: Enrichment) {
  const [low, high] = e[INTERVAL]
  return `${e[ODDS].toFixed(1)}× <span class="muted">(95% CI ${low}–${high})</span>`
}

function forestPosition(x: number) {
  return (100 * Math.log(x / FOREST.min)) / Math.log(FOREST.max / FOREST.min)
}

function interfaceShare(e: Enrichment, label: 'pathogenic' | 'benign') {
  const [n = 0, d = 1] = e[`${label} at interface`].split('/').map(Number)
  return { n, d, share: n / d }
}

export function shareFigure(e: Enrichment) {
  const shares = (['pathogenic', 'benign'] as const).map(label => ({
    label,
    ...interfaceShare(e, label),
  }))
  const most = Math.max(...shares.map(s => s.share))
  return `
    <figure class="share-figure">
      <figcaption>Share of ClinVar missense variants that sit at a predicted interface</figcaption>
      ${shares
        .map(
          s => `<div class="share-row" title="${s.n.toLocaleString()} of ${s.d.toLocaleString()} ${s.label} variants">
            <div class="share-value">${Math.round(100 * s.share)}%</div>
            <div class="share-bar"><span style="width:${(100 * s.share) / most}%;background:var(--${s.label})"></span></div>
            <div class="muted">${LABELS[s.label]}: ${s.n.toLocaleString()} of ${s.d.toLocaleString()}</div>
          </div>`,
        )
        .join('')}
    </figure>`
}

export function forestPlot(rows: { label: string; e: Enrichment }[]) {
  return `
    <div class="forest">
      ${rows
        .map(({ label, e }) => {
          const [low, high] = e[INTERVAL]
          const shares = (['pathogenic', 'benign'] as const)
            .map(name => {
              const { n, d } = interfaceShare(e, name)
              return `${percent(n, d)} of ${d.toLocaleString()} ${name}`
            })
            .join(', ')
          return `<div class="forest-row" title="${e['proteins informative']} proteins with both pathogenic and benign variants">
            <div class="forest-label"><strong>${esc(label)}</strong><span class="muted">at an interface: ${shares}</span></div>
            <div class="forest-track">
              <span class="forest-null" style="left:${forestPosition(1)}%"></span>
              <span class="forest-ci" style="left:${forestPosition(low)}%;width:${forestPosition(high) - forestPosition(low)}%"></span>
              <span class="forest-dot" style="left:${forestPosition(e[ODDS])}%"></span>
            </div>
            <div class="forest-value">${e[ODDS].toFixed(1)}× <span class="muted">${low.toFixed(2)}–${high.toFixed(2)}</span></div>
          </div>`
        })
        .join('')}
      <div class="forest-row forest-axis">
        <div class="forest-label"></div>
        <div class="forest-track">${FOREST.ticks.map(t => `<span class="forest-tick" style="left:${forestPosition(t)}%">${t}×</span>`).join('')}</div>
        <div class="forest-value"></div>
      </div>
    </div>`
}

export function confidenceRows(summary: Summary) {
  return Object.entries(summary.enrichment.byConfidenceBand)
    .filter(([name]) => name.startsWith('ipSAE'))
    .map(([label, e]) => ({ label, e }))
}

export function alphaMissenseRows(summary: Summary) {
  return Object.entries(summary.enrichment.byAlphaMissenseClass).map(
    ([label, e]) => ({
      label: label
        .replace('AlphaMissense l', 'L')
        .replace('AlphaMissense a', 'A'),
      e,
    }),
  )
}

export function compositionBar(counts: Record<Label, number>) {
  const total = LABEL_KEYS.reduce((n, label) => n + counts[label], 0)
  return `
    <div class="stack" role="img" aria-label="Classified missense variants at an interface: ${LABEL_KEYS.map(label => `${counts[label].toLocaleString()} ${label}`).join(', ')}">
      ${LABEL_KEYS.map(label => `<span style="flex-grow:${counts[label]};background:var(--${label})" title="${LABELS[label]}: ${counts[label].toLocaleString()} (${percent(counts[label], total)})"></span>`).join('')}
    </div>
    <div class="legend">
      ${LABEL_KEYS.map(label => `<span><span class="swatch" style="background:var(--${label})"></span>${LABELS[label]} <strong>${counts[label].toLocaleString()}</strong> (${percent(counts[label], total)})</span>`).join('')}
    </div>`
}

export function callBars(
  calls: Record<Label, { scored: number; likelyPathogenic: number }>,
) {
  return `
    <div class="bars">
      ${LABEL_KEYS.map(label => {
        const { scored, likelyPathogenic } = calls[label]
        return `<div class="bar-row" title="${likelyPathogenic.toLocaleString()} of ${scored.toLocaleString()} scored">
            <div>ClinVar ${LABELS[label].toLowerCase()}</div>
            <div class="bar-track"><span style="width:${(100 * likelyPathogenic) / scored}%;background:var(--${label})"></span></div>
            <div class="bar-value">${percent(likelyPathogenic, scored)}</div>
          </div>`
      }).join('')}
    </div>`
}

const SCATTER_TICKS = [0, 5, 25, 50, 100, 200, 400]

function scatterTip(g: GeneRow) {
  return `<strong>${esc(g.gene)}</strong> with ${esc(g.topPartner)}${g.partners > 1 ? ` and ${g.partners - 1} more` : ''}<br />${LABEL_KEYS.map(label => `<span class="swatch" style="background:var(--${label})"></span>${g[label]} ${label}`).join(' · ')}<br /><span class="muted">${g.interfaceResidues} interface residues of ${g.length}</span>`
}

export function geneScatter(genes: GeneRow[]) {
  const width = 1000
  const height = 440
  const left = 54
  const bottom = 46
  const maxX = Math.max(...genes.map(g => g.uncertain))
  const maxY = Math.max(...genes.map(g => g.pathogenic))
  const x = (v: number) => left + Math.sqrt(v / maxX) * (width - left - 70)
  const y = (v: number) =>
    height - bottom - Math.sqrt(v / maxY) * (height - bottom - 20)
  const distance = (g: GeneRow) => g.uncertain / maxX + g.pathogenic / maxY
  const placed: { x: number; y: number; w: number; h: number; gene: string }[] =
    []
  for (const g of genes
    .toSorted((a, b) => distance(b) - distance(a))
    .slice(0, 40)) {
    const box = {
      x: x(g.uncertain) + 8,
      y: y(g.pathogenic) - 7,
      w: g.gene.length * 8 + 4,
      h: 15,
      gene: g.gene,
    }
    if (
      placed.every(
        p =>
          box.x > p.x + p.w ||
          p.x > box.x + box.w ||
          box.y > p.y + p.h ||
          p.y > box.y + box.h,
      )
    ) {
      placed.push(box)
    }
  }
  return `
    <div class="scatter-wrap">
      <svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-label="Each gene by its pathogenic and uncertain ClinVar missense variants at a predicted interface">
        ${SCATTER_TICKS.filter(t => t <= maxX)
          .map(
            t =>
              `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="20" y2="${height - bottom}" /><text class="tick" x="${x(t)}" y="${height - bottom + 18}" text-anchor="middle">${t}</text>`,
          )
          .join('')}
        ${SCATTER_TICKS.filter(t => t <= maxY)
          .map(
            t =>
              `<line class="grid" x1="${left}" x2="${width - 16}" y1="${y(t)}" y2="${y(t)}" /><text class="tick" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`,
          )
          .join('')}
        <text class="axis-title" x="${(width + left) / 2}" y="${height - 6}" text-anchor="middle">Variants of uncertain significance at an interface →</text>
        <text class="axis-title" x="${left - 40}" y="12">↑ Pathogenic variants at an interface</text>
        ${genes.map(g => `<circle data-url="${geneHref(g.page)}" data-tip="${esc(scatterTip(g))}" cx="${x(g.uncertain)}" cy="${y(g.pathogenic)}" r="4.5" />`).join('')}
        ${placed.map(p => `<text class="gene-label" x="${p.x}" y="${p.y + 11}">${esc(p.gene)}</text>`).join('')}
      </svg>
    </div>
    <div class="tooltip" id="scatter-tip" hidden></div>`
}

export function recallHistogram(
  series: { label: string; colour: string; v: Validation }[],
) {
  const width = 1000
  const height = 300
  const left = 54
  const bottom = 44
  const bins = series[0]?.v.histogram.length ?? 0
  const shares = series.map(s => s.v.histogram.map(n => n / s.v.touching))
  const most = Math.ceil(10 * Math.max(...shares.flat())) / 10
  const slot = (width - left - 20) / bins
  const bar = (slot - 10) / series.length
  const y = (share: number) =>
    height - bottom - (share / most) * (height - bottom - 24)
  const ticks = Array.from(
    { length: Math.round(most * 10) + 1 },
    (_, tick) => tick / 10,
  )
  return `
    <svg class="map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Share of predicted pairs by the share of their experimental interface that the prediction covers">
      ${ticks.map(n => `<line class="baseline" x1="${left}" x2="${width - 20}" y1="${y(n)}" y2="${y(n)}" /><text class="tick" x="${left - 8}" y="${y(n) + 4}" text-anchor="end">${Math.round(100 * n)}%</text>`).join('')}
      ${series
        .map((s, index) =>
          s.v.histogram
            .map(
              (n, bin) =>
                `<rect x="${left + bin * slot + 5 + index * bar}" y="${y(shares[index]?.[bin] ?? 0)}" width="${bar - 1}" height="${height - bottom - y(shares[index]?.[bin] ?? 0)}" fill="${s.colour}"><title>${n} ${esc(s.label)}: ${bin * (100 / bins)}–${(bin + 1) * (100 / bins)}% of the experimental interface predicted</title></rect>`,
            )
            .join(''),
        )
        .join('')}
      <line class="axis" x1="${left}" x2="${width - 20}" y1="${height - bottom}" y2="${height - bottom}" />
      ${Array.from({ length: bins + 1 }, (_, bin) => `<text class="tick" x="${left + bin * slot}" y="${height - bottom + 16}" text-anchor="middle">${bin * (100 / bins)}%</text>`).join('')}
      <text class="tick" x="${(left + width - 20) / 2}" y="${height - 6}" text-anchor="middle">Share of the experimental interface that the prediction covers</text>
    </svg>
    <div class="legend">
      ${series.map(s => `<span><span class="swatch" style="background:${s.colour}"></span>${esc(s.label)} (${s.v.touching.toLocaleString()} pairs)</span>`).join('')}
    </div>`
}

export function shareBars(
  rows: {
    label: string
    n: number
    d: number
    title: string
    colour?: string
  }[],
  colour: string,
) {
  return `
    <div class="bars">
      ${rows
        .map(
          row => `<div class="bar-row" title="${esc(row.title)}">
            <div>${esc(row.label)}</div>
            <div class="bar-track"><span style="width:${(100 * row.n) / row.d}%;background:${row.colour ?? colour}"></span></div>
            <div class="bar-value">${percent(row.n, row.d)}</div>
          </div>`,
        )
        .join('')}
    </div>`
}

export function conservationQuartileRows(summary: Summary) {
  const { edges, quartiles } = summary.conservation.variants
  return quartiles.map((counts, i) => {
    const low = edges[i - 1]
    const high = edges[i]
    return {
      label:
        low === undefined
          ? `phyloP < ${high}`
          : high === undefined
            ? `phyloP ≥ ${low}`
            : `phyloP ${low}–${high}`,
      n: counts.pathogenic,
      d: counts.pathogenic + counts.benign,
      title: `${counts.pathogenic.toLocaleString()} pathogenic and ${counts.benign.toLocaleString()} benign`,
    }
  })
}

const MATCHED = ', matched for conservation'

export function conservationRows(summary: Summary) {
  const { all, orderedSurface } = summary.conservation.enrichment
  return [
    { label: 'All residues', e: all.unmatched },
    { label: `All residues${MATCHED}`, e: all.matched },
    { label: 'Folded and surface-exposed', e: orderedSurface.unmatched },
    {
      label: `Folded and surface-exposed${MATCHED}`,
      e: orderedSurface.matched,
    },
  ]
}

function conservedRow(label: string, r: ResidueConservation) {
  return {
    label,
    n: r['interface more conserved'],
    d: r.complexes,
    title: `${r['interface more conserved'].toLocaleString()} of ${r.complexes.toLocaleString()} complexes; median difference ${r['median difference']} phyloP`,
  }
}

export function patchRows(summary: Summary) {
  const { all, byConfidenceBand } = summary.conservation.residues.patches
  const median = 'above the median patch'
  return [
    ...Object.entries(byConfidenceBand).map(([label, p]) => ({
      label,
      n: p[median].interface,
      d: p.complexes,
      title: `${p[median].interface.toLocaleString()} of ${p.complexes.toLocaleString()} interfaces`,
    })),
    {
      label: 'A random patch instead',
      n: all[median].fake,
      d: all.complexes,
      title: `${all[median].fake.toLocaleString()} of ${all.complexes.toLocaleString()} random patches ranked in place of the interface`,
      colour: 'var(--benign)',
    },
  ]
}

export function conservedInterfaceRows(summary: Summary) {
  return Object.entries(summary.conservation.residues.byConfidenceBand).map(
    ([label, r]) => conservedRow(label, r),
  )
}
