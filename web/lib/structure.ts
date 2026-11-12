import { LABEL_KEYS, LABELS, esc, residueCount } from './html.ts'
import { isBindingRegion, partnerResidues } from './maps.ts'
import type { ScenePartner, SceneVariant } from './scene.ts'
import type { Gene } from './types.ts'

function range(start: number, end: number) {
  return start === end ? `${start}` : `${start}–${end}`
}

export function structureData(gene: Gene) {
  const partners = gene.partners.flatMap(p =>
    p.chain ? [{ gene: p.gene, entity: p.entity, chain: p.chain, residues: partnerResidues(p) } satisfies ScenePartner] : [],
  )
  const variants = gene.variants.map(
    v => ({ change: v.change, label: v.label, position: v.position, partners: v.partners }) satisfies SceneVariant,
  )
  return { partners, variants }
}

export function stories(gene: Gene) {
  return gene.partners.flatMap(p => {
    const residues = new Set(partnerResidues(p))
    const touching = gene.variants.filter(v => v.partners.includes(p.gene))
    const counts = LABEL_KEYS.map(label => [label, touching.filter(v => v.label === label).length] as const)
    const pathogenic = touching.filter(v => v.label === 'pathogenic').length
    const regions = gene.features.filter(
      f => f.type === 'Region' && isBindingRegion(f) && [...residues].some(r => r >= f.start && r <= f.end),
    )
    const experiment = p.experiment
    const html = [
      `<strong>${esc(gene.gene)}–${esc(p.gene)}.</strong> In AlphaFold DB's predicted complex (ipSAE ${p.ipsae?.toFixed(2)}), ${residueCount(p.residues)} of ${esc(gene.gene)} touch ${esc(p.gene)}.`,
      touching.length
        ? `${touching.length} ClinVar missense variant${touching.length === 1 ? '' : 's'} sit on them: ${counts
            .filter(([, n]) => n)
            .map(([label, n]) => `<span class="count ${label}">${n} ${LABELS[label].toLowerCase()}</span>`)
            .join(', ')}.`
        : 'No ClinVar missense variant sits on them yet.',
      experiment?.experimental
        ? `PDB <a href="https://www.rcsb.org/structure/${esc(experiment.pdb)}">${esc(experiment.pdb.toUpperCase())}</a>, an experimental structure holding both, puts ${residueCount(experiment.experimental)} of ${esc(gene.gene)} in contact with ${esc(p.gene)}; the prediction finds ${experiment.shared} of them.`
        : '',
      regions.length
        ? `UniProt annotates ${regions.map(f => `${range(f.start, f.end)} as “${esc(f.description)}”`).join(' and ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    return p.chain ? [{ gene: p.gene, pathogenic, html }] : []
  })
}

export function initialPartner(gene: Gene) {
  return stories(gene).reduce<{ gene: string; pathogenic: number } | undefined>(
    (best, s) => (!best || s.pathogenic > best.pathogenic ? s : best),
    undefined,
  )?.gene
}
