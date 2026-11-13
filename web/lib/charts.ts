import { LABEL_KEYS, esc } from './html.ts'
import { geneHref } from './site.ts'
import type { Enrichment, GeneRow } from './types.ts'

const ODDS = 'Mantel–Haenszel odds ratio'
const INTERVAL = '95% CI (bootstrap over proteins)'

export function odds(e: Enrichment) {
  return e[ODDS]
}

export function oddsText(e: Enrichment) {
  const [low, high] = e[INTERVAL]
  return `${e[ODDS].toFixed(1)}× <span class="muted">(95% CI ${low}–${high})</span>`
}

const SCATTER_TICKS = [0, 5, 25, 50, 100, 200, 400]

function scatterTip(g: GeneRow) {
  return `<strong>${esc(g.gene)}</strong> with ${esc(g.topPartner === g.gene ? 'itself' : g.topPartner)}${g.partners > 1 ? ` and ${g.partners - 1} more` : ''}<br />${LABEL_KEYS.map(label => `<span class="swatch" style="background:var(--${label})"></span>${g[label]} ${label}`).join(' · ')}<br /><span class="muted">${g.interfaceResidues} interface residues of ${g.length}</span>`
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
