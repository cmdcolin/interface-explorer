import { gene as readGene, geneRows } from './data.ts'
import { LABEL_KEYS, LABELS, esc, residueCount } from './html.ts'
import { isBindingRegion, partnerGroups, partnerResidues } from './maps.ts'
import type { ScenePartner, SceneVariant } from './scene.ts'
import { geneHref } from './site.ts'
import type { Gene, GeneVariant } from './types.ts'

type Partner = Gene['partners'][number]

let pages: Map<string, string> | undefined

function pageOf(accession: string | null) {
  pages ??= new Map(geneRows().map(row => [row.accession, row.page]))
  return accession ? pages.get(accession) : undefined
}

function sceneVariant(v: GeneVariant, partners = v.partners) {
  return { change: v.change, label: v.label, position: v.position, partners } satisfies SceneVariant
}

export function partnerSide(gene: Gene, p: Partner) {
  const page = pageOf(p.accession)
  const record = page ? readGene(page) : undefined
  const entry = record?.partners.find(q => q.entity === p.entity)
  return page && record && entry
    ? {
        page,
        ownName: entry.gene,
        residues: partnerResidues(entry),
        variants: record.variants.filter(v => v.partners.includes(entry.gene)).map(v => sceneVariant(v, [gene.gene])),
      }
    : undefined
}

function countList(variants: { label: string }[]) {
  return LABEL_KEYS.map(label => [label, variants.filter(v => v.label === label).length] as const)
    .filter(([, n]) => n)
    .map(([label, n]) => `<span class="count ${label}">${n} ${LABELS[label].toLowerCase()}</span>`)
    .join(', ')
}

function range(start: number, end: number) {
  return start === end ? `${start}` : `${start}–${end}`
}

export function structureData(gene: Gene) {
  const partners = gene.partners.flatMap(p => {
    const side = partnerSide(gene, p)
    return p.chain
      ? [
          {
            gene: p.gene,
            entity: p.entity,
            chain: p.chain,
            residues: partnerResidues(p),
            ...(side ? { side: { residues: side.residues, variants: side.variants } } : {}),
          } satisfies ScenePartner,
        ]
      : []
  })
  return { partners, variants: gene.variants.map(v => sceneVariant(v)) }
}

export const AGREEMENT = { confirmed: 2, unchecked: 1, contradicted: 0 }

function agreement(experiment: Partner['experiment']) {
  return experiment?.experimental
    ? experiment.shared >= experiment.experimental / 2
      ? AGREEMENT.confirmed
      : AGREEMENT.contradicted
    : AGREEMENT.unchecked
}

export function leadPartner(candidates: { gene: string; pathogenic: number; agreement: number }[]) {
  const rank = (c: (typeof candidates)[number]) => [Math.sign(c.pathogenic), c.agreement, c.pathogenic]
  return candidates.toSorted((a, b) => {
    const ra = rank(a)
    return rank(b).map((x, i) => x - (ra[i] ?? 0)).find(d => d !== 0) ?? 0
  })[0]?.gene
}

function experimentSentence(gene: string, partner: string, e: NonNullable<Partner['experiment']>) {
  const pdb = `PDB <a href="https://www.rcsb.org/structure/${esc(e.pdb)}">${esc(e.pdb.toUpperCase())}</a>`
  return !e.experimental
    ? `<span class="caution">${pdb} holds both proteins, but there ${esc(gene)} does not touch ${esc(partner)}, so treat this interface with caution.</span>`
    : agreement(e) === AGREEMENT.contradicted
      ? `<span class="caution">${pdb}, an experimental structure holding both, shows a different interface: of the ${residueCount(e.experimental)} of ${esc(gene)} in contact there, the prediction finds only ${e.shared}.</span>`
      : `${pdb}, an experimental structure holding both, puts ${residueCount(e.experimental)} of ${esc(gene)} in contact with ${esc(partner)}; the prediction finds ${e.shared} of them.`
}

export function stories(gene: Gene) {
  return gene.partners.flatMap(p => {
    const residues = new Set(partnerResidues(p))
    const touching = gene.variants.filter(v => v.partners.includes(p.gene))
    const pathogenic = touching.filter(v => v.label === 'pathogenic').length
    const regions = gene.features.filter(
      f => f.type === 'Region' && isBindingRegion(f) && [...residues].some(r => r >= f.start && r <= f.end),
    )
    const experiment = p.experiment
    const side = partnerSide(gene, p)
    const sideLink = side
      ? `<a href="${geneHref(side.page)}?partner=${encodeURIComponent(side.ownName)}">${esc(p.gene)}'s page</a>`
      : ''
    const html = [
      `<strong>${esc(gene.gene)}–${esc(p.gene)}.</strong> In AlphaFold DB's predicted complex (ipSAE ${p.ipsae?.toFixed(2)}), ${residueCount(p.residues)} of ${esc(gene.gene)} touch ${esc(p.gene)}.`,
      touching.length
        ? `${touching.length} ClinVar missense variant${touching.length === 1 ? '' : 's'} sit on them: ${countList(touching)}.`
        : 'No ClinVar missense variant sits on them yet.',
      side
        ? side.variants.length
          ? `${esc(p.gene)} is a disease protein too, and its side of the interface carries ${countList(side.variants)} variant${side.variants.length === 1 ? '' : 's'}, shaded the same way (${sideLink}).`
          : `${esc(p.gene)} is a disease protein too, with no ClinVar missense variant on its side of the interface (${sideLink}).`
        : '',
      experiment
        ? experimentSentence(gene.gene, p.gene, experiment)
        : '',
      regions.length
        ? `UniProt annotates ${regions.map(f => `${range(f.start, f.end)} as “${esc(f.description)}”`).join(' and ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    return p.chain ? [{ gene: p.gene, pathogenic, agreement: agreement(experiment), html }] : []
  })
}

export function partnerPicks(gene: Gene) {
  const told = stories(gene)
  const pathogenicOf = (name: string) => told.find(s => s.gene === name)?.pathogenic ?? 0
  return partnerGroups(gene.partners.filter(p => p.chain)).map(g => ({
    gene: g.names[0] ?? '',
    names: g.names,
    pathogenic: pathogenicOf(g.names[0] ?? ''),
  }))
}

export function initialPartner(gene: Gene) {
  return leadPartner(stories(gene))
}
