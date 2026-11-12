import { GPCR_TRACKS, locusUrl, pdbSpec, sessionUrl } from '../../src/links.ts'
import { LABEL_KEYS, LABELS, clinvarHref, esc, residueCount } from './html.ts'
import { JBROWSE } from './site.ts'
import type { Agreement, Side, SideVariant } from './types.ts'

function variantCounts(variants: SideVariant[]) {
  return LABEL_KEYS.map(
    label => [label, variants.filter(v => v.label === label).length] as const,
  )
    .filter(([, n]) => n)
    .map(
      ([label, n]) =>
        `<span class="count ${label}">${n} ${LABELS[label].toLowerCase()}</span>`,
    )
    .join(', ')
}

export function variantDetails(
  variants: SideVariant[],
  differing: number[] = [],
  generic: Record<string, string> = {},
) {
  return variants.length
    ? `<details><summary>${variantCounts(variants)}</summary>${variants
        .map(
          v =>
            `<a href="${clinvarHref(v.variation)}">${esc(v.change)}</a>${differing.includes(v.position) ? '<span title="The structure has a different residue here than the human protein">*</span>' : ''}${generic[v.position] ? ` <span class="generic" title="GPCRdb generic number">${esc(generic[v.position])}</span>` : ''} <span class="muted">${LABELS[v.label]}</span>`,
        )
        .join(', ')}</details>`
    : '—'
}

export function agreementText(afdb: Agreement | null, partial = false) {
  return afdb
    ? `${Math.round(afdb.recall * 100)}% <span class="muted">of these${partial ? '' : `; ${Math.round(afdb.precision * 100)}% of the ${afdb.predicted} AFDB residues`} (vs ${esc(afdb.partner)})</span>`
    : '<span class="muted" title="AlphaFold DB has no complex of this receptor with a Gα">—</span>'
}

export function sideCell(side: Side) {
  const differing = side.differing.length
  const generic = side.generic ?? {}
  const count = residueCount(side.residues.length)
  const labelled = side.generic
    ? `<span class="tip" title="Residue (GPCRdb generic number): ${esc(side.residues.map(r => (generic[r] ? `${r} (${generic[r]})` : r)).join(', '))}">${count}</span>`
    : count
  return `${labelled}${differing ? ` <span class="muted" title="Residues ${side.differing.join(', ')} differ from the human protein in this structure">(${differing} not as in human)</span>` : ''}<br />${variantDetails(side.variants, side.differing, generic)}`
}

export function gAlphaCell(gProteins: Side[]) {
  return gProteins.length
    ? gProteins
        .map(
          g =>
            `${gProteins.length > 1 || g.chimera ? `${esc(g.gene)}${g.chimera ? ' <span class="muted">segment</span>' : ''}: ` : ''}${sideCell(g)}`,
        )
        .join('<br />')
    : '<span class="muted" title="No part of this Gα matches a human Gα sequence">not mapped</span>'
}

export function receptorLinks(gene: string, pdb: string, locus: string | null) {
  const structure = `<a href="${sessionUrl(pdbSpec(gene, pdb, locus), JBROWSE)}">3D</a>`
  return locus
    ? `<a href="${locusUrl(locus, GPCR_TRACKS, JBROWSE)}">Genome</a> · ${structure}`
    : structure
}
