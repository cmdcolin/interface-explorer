import type { PatchRank } from '../../src/conservation.ts'
import {
  ALPHAMISSENSE_EVIDENCE,
  BP4_SUPPORTING,
  PP3_SUPPORTING,
  alphaMissenseEvidence,
} from '../../src/constants.ts'
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

export function evidenceText(score: number) {
  const band = alphaMissenseEvidence(score)
  return band.code ? `${band.code} ${band.strength}` : band.strength
}

export function amCell(score: number | undefined) {
  const points = score === undefined ? 0 : alphaMissenseEvidence(score).points
  return score === undefined
    ? '<span class="muted" title="AlphaMissense has no score for this substitution">—</span>'
    : `<span class="count ${points > 0 ? 'pathogenic' : points < 0 ? 'benign' : 'indeterminate'}" title="AlphaMissense ${score}: ${evidenceText(score)} (ClinGen calibration, Bergquist et al. 2025)">${score.toFixed(2)}</span>`
}

const QUARTERS = ['least', 'second least', 'second most', 'most']

export function phylopCell(score: number | undefined, edges: number[]) {
  const quarter =
    QUARTERS[edges.filter(edge => (score ?? -Infinity) >= edge).length]
  return score === undefined
    ? '<span class="muted" title="No phyloP score at this base">—</span>'
    : `<span title="phyloP across 100 vertebrates at the changed base: in the ${quarter} conserved quarter of ClinVar variants in proteins with a predicted partner">${score.toFixed(1)}</span>`
}

export function conservedCell(rank: PatchRank | undefined) {
  const share = (x: number) => `${Math.round(100 * x)}%`
  return rank?.anywhere === undefined
    ? '<span class="muted" title="Too little other folded surface on this protein to compare with">—</span>'
    : `<span title="Across 100 vertebrates, this interface is more conserved than ${share(rank.anywhere)} of patches of the same size on the rest of the protein's folded surface${rank.nearby === undefined ? '' : `, and ${share(rank.nearby)} of those within 25 Å of it`}. A random patch would beat about half.">${share(rank.anywhere)}</span>`
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

const BERGQUIST = 'https://doi.org/10.1016/j.gim.2025.101402'

export function alphaMissenseNote() {
  const from = (points: number) =>
    ALPHAMISSENSE_EVIDENCE.find(band => band.points === points)?.from
  return `<a href="https://doi.org/10.1126/science.adg7492">AlphaMissense</a> scores a substitution from 0 to 1.
    Calibrated against ClinVar for clinical use (<a href="${BERGQUIST}">Bergquist et al. 2025</a>), ${PP3_SUPPORTING} and
    above is supporting evidence of pathogenicity (ACMG PP3), ${from(2)} moderate and ${from(4)} strong; ${BP4_SUPPORTING}
    and below is supporting evidence of benignity (BP4); between is indeterminate. Its developers' "likely pathogenic"
    cut-off of 0.564 does not reach even supporting evidence. It sees the sequence and the single-protein structure, not the
    partner.`
}

export function leadNote(change: string, pathogenicHere: string[]) {
  const others = pathogenicHere.filter(c => c !== change)
  return [
    pathogenicHere.includes(change)
      ? '<span title="The same amino-acid change, from a different nucleotide change, is classified pathogenic (ACMG PS1)">same change pathogenic · PS1</span>'
      : '',
    others.length
      ? `<span title="A different substitution at this residue is classified pathogenic (ACMG PM5)">pathogenic ${others.map(esc).join(', ')} here · PM5</span>`
      : '',
  ]
    .filter(Boolean)
    .join('<br />')
}
