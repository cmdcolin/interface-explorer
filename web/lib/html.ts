import type { Label } from './types.ts'

export const LABELS: Record<Label, string> = {
  pathogenic: 'Pathogenic',
  uncertain: 'Uncertain',
  benign: 'Benign',
}
export const LABEL_KEYS: Label[] = ['pathogenic', 'uncertain', 'benign']

export function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

export function percent(n: number, d: number) {
  return `${Math.round((100 * n) / d)}%`
}

export function chip(label: Label) {
  return `<span class="chip ${label}">${LABELS[label]}</span>`
}

export function residueCount(n: number) {
  return `${n} residue${n === 1 ? '' : 's'}`
}

export function amClass(
  score: number,
  thresholds: { likelyPathogenic: number; likelyBenign: number },
): Label {
  return score > thresholds.likelyPathogenic
    ? 'pathogenic'
    : score < thresholds.likelyBenign
      ? 'benign'
      : 'uncertain'
}

export const AM_TITLE: Record<Label, string> = {
  pathogenic: 'likely pathogenic',
  uncertain: 'ambiguous',
  benign: 'likely benign',
}

export function amCell(
  score: number | undefined,
  thresholds: { likelyPathogenic: number; likelyBenign: number },
) {
  return score === undefined
    ? '<span class="muted" title="AlphaMissense has no score for this substitution">—</span>'
    : `<span class="count ${amClass(score, thresholds)}" title="AlphaMissense: ${AM_TITLE[amClass(score, thresholds)]}">${score.toFixed(2)}</span>`
}

export function conditionCell(conditions: string[]) {
  return conditions.length
    ? `<span title="${esc(conditions.join('; '))}">${esc(conditions[0])}${conditions.length > 1 ? ` <span class="muted">+${conditions.length - 1} more</span>` : ''}</span>`
    : '<span class="muted">—</span>'
}

export function clinvarHref(variation: number) {
  return `https://www.ncbi.nlm.nih.gov/clinvar/variation/${variation}/`
}

export function axisLabels(length: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(length, 4) / 4))
  const step =
    [1, 2, 5].map(m => m * magnitude).find(s => length / s <= 8) ??
    10 * magnitude
  return [
    1,
    ...Array.from(
      { length: Math.floor((length * 0.94) / step) },
      (_, k) => (k + 1) * step,
    ),
    length,
  ]
}
