import { GPCR_TRACKS, locusUrl, pdbSpec, sessionUrl } from '../../src/links.ts'
import { gene as readGene, gpcr } from './data.ts'
import { LABEL_KEYS, LABELS, clinvarHref, esc, residueCount } from './html.ts'
import { modelUrl, otherChain, pdbModel } from './scene.ts'
import { structureData } from './structure.ts'
import { JBROWSE } from './site.ts'
import type { Agreement, Complex, LabelAnchors, Side, SideVariant } from './types.ts'

const GPCRDB = 'GPCRdb generic number'
const CGN = 'common Gα numbering, CGN'

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
  numbering = GPCRDB,
) {
  return variants.length
    ? `<details><summary>${variantCounts(variants)}</summary>${variants
        .map(
          v =>
            `<a href="${clinvarHref(v.variation)}">${esc(v.change)}</a>${differing.includes(v.position) ? '<span title="The structure has a different residue here than the human protein">*</span>' : ''}${generic[v.position] ? ` <span class="generic" title="${numbering}">${esc(generic[v.position])}</span>` : ''} <span class="muted">${LABELS[v.label]}</span>`,
        )
        .join(', ')}</details>`
    : '—'
}

export function agreementText(afdb: Agreement | null, partial = false) {
  return afdb
    ? `${Math.round(afdb.recall * 100)}% <span class="muted">of these${partial ? '' : `; ${Math.round(afdb.precision * 100)}% of the ${afdb.predicted} AFDB residues`} (vs ${esc(afdb.partner)})</span>`
    : '<span class="muted" title="AlphaFold DB has no complex of this receptor with a Gα">—</span>'
}

export function gAlphaAgreementText({ gProteins, gAlphaAfdb }: Complex) {
  return gAlphaAfdb
    ? `<span class="tip" title="The ${esc(gProteins.map(g => g.gene).join('+'))} residues within 5 Å of the receptor, mapped onto ${esc(gAlphaAfdb.partner)} by sequence">${agreementText(gAlphaAfdb)}</span>`
    : agreementText(null)
}

export function sideCell(side: Side, numbering = GPCRDB) {
  const differing = side.differing.length
  const generic = side.generic ?? {}
  const count = residueCount(side.residues.length)
  const labelled = side.generic
    ? `<span class="tip" title="Residue (${numbering}): ${esc(side.residues.map(r => (generic[r] ? `${r} (${generic[r]})` : r)).join(', '))}">${count}</span>`
    : count
  return `${labelled}${differing ? ` <span class="muted" title="Residues ${side.differing.join(', ')} differ from the human protein in this structure">(${differing} not as in human)</span>` : ''}<br />${variantDetails(side.variants, side.differing, generic, numbering)}`
}

export function gAlphaCell(gProteins: Side[]) {
  return gProteins.length
    ? gProteins
        .map(
          g =>
            `${gProteins.length > 1 || g.chimera ? `${esc(g.gene)}${g.chimera ? ' <span class="muted">segment</span>' : ''}: ` : ''}${sideCell(g, CGN)}`,
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

export const ALPHA5 = 'G.H5.'

export function alpha5(side: Side) {
  return side.residues.filter(position => side.generic?.[position]?.startsWith(ALPHA5))
}

export function gpcrRegions(anchors: LabelAnchors, receptor: string, gAlpha: string, gAlphaChain: string, helix: number[]) {
  return [
    { text: receptor, at: anchors.receptor },
    { text: gAlpha, at: anchors.gAlpha },
    ...(helix.length ? [{ text: 'α5 helix', at: { chain: gAlphaChain, residues: helix } }] : []),
  ]
}

function inStructure(side: Side, partner: string) {
  return {
    residues: side.residues.flatMap(position => side.auth[position] ?? []),
    variants: side.variants.flatMap(v => {
      const position = side.auth[v.position]
      return position === undefined ? [] : [{ change: v.change, label: v.label, position, partners: [partner] }]
    }),
  }
}

export function complexView(pdb: string, gAlpha: string) {
  const complex = gpcr().complexes.find(c => c.pdb === pdb)
  const g = complex?.gProteins.find(side => side.gene === gAlpha)
  const receptor = complex?.receptorSide
  const own = g && receptor ? inStructure(g, receptor.gene) : undefined
  return complex && g && receptor && own
    ? {
        partner: {
          gene: receptor.gene,
          entity: pdb,
          chain: g.chain,
          residues: own.residues,
          side: inStructure(receptor, g.gene),
        },
        variants: own.variants,
        model: pdbModel(pdb, receptor.chain, complex.axis),
        regions: gpcrRegions(
          complex.anchors,
          `${complex.receptor} receptor`,
          `G${complex.g_subtype}`,
          g.chain,
          alpha5(g).flatMap(position => g.auth[position] ?? []),
        ),
      }
    : undefined
}

export function predictedView(pdb: string, gAlphaName: string) {
  const complex = gpcr().complexes.find(c => c.pdb === pdb)
  const predicted = complex?.gAlphaAfdb
  const receptorGene = complex?.receptorSide.gene
  const data = predicted ? structureData(readGene(predicted.partner)) : undefined
  const partner = data?.partners.find(p => p.gene === receptorGene)
  const cgn = predicted ? (gpcr().cgn[predicted.partner]?.labels ?? {}) : {}
  return predicted && receptorGene && data && partner
    ? {
        partner,
        variants: data.variants,
        model: { url: modelUrl(partner.entity), partnerChain: otherChain(partner.chain), up: predicted.axis },
        regions: gpcrRegions(
          predicted.anchors,
          receptorGene,
          gAlphaName,
          partner.chain,
          partner.residues.filter(position => cgn[position]?.startsWith(ALPHA5)),
        ),
      }
    : undefined
}
