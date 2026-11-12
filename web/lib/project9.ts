import { gene, gpcr } from './data.ts'

const OLFACTORY = /^OR\d/

export function project9() {
  const data = gpcr()
  const dataset = data.complexes.filter(c => c.dataset === 'DataSet1')
  const receptors = dataset.map(c => c.receptorSide)
  const or51e2 = data.complexes.find(c => c.receptorSide.gene === 'OR51E2')
  const labels = receptors.flatMap(r =>
    r.residues.map(position => r.generic?.[position] ?? ''),
  )
  const numbered = labels.filter(label => label.includes('x'))
  const loops = [
    ...new Set(labels.filter(label => label && !label.includes('x'))),
  ].sort()
  const variants = receptors.flatMap(r =>
    r.variants.map(v => ({ ...v, generic: r.generic?.[v.position] })),
  )
  const gnai1 = data.gAlphas.find(g => g.gene === 'GNAI1')
  const drd5 = receptors.find(r => r.gene === 'DRD5')
  const gnal = gene('GNAL')
  const olfactory = gnal.partners.filter(p => OLFACTORY.test(p.gene))
  const ipsae = olfactory.map(p => p.ipsae ?? 0)
  const or51e2Side = or51e2?.receptorSide
  return {
    complexes: dataset.length,
    or51e2: {
      pdb: or51e2?.pdb ?? '',
      resolution: or51e2?.resolution ?? '',
      residues: or51e2Side?.residues.length ?? 0,
      partner: or51e2Side?.afdb?.partner ?? '',
      recall: Math.round((or51e2Side?.afdb?.recall ?? 0) * 100),
      precision: Math.round((or51e2Side?.afdb?.precision ?? 0) * 100),
      variants: (or51e2Side?.variants ?? [])
        .map(
          v =>
            `${v.change} at ${or51e2Side?.generic?.[v.position] ?? v.position}`,
        )
        .join(', '),
      variantCount: or51e2Side?.variants.length ?? 0,
    },
    contacts: labels.length,
    numbered: numbered.length,
    loops,
    uncertain: variants.filter(v => v.label === 'uncertain').length,
    benign: variants.filter(v => v.label === 'benign').length,
    variants: variants.length,
    positions: new Set(numbered).size,
    gnai1Structures: gnai1?.structures ?? 0,
    gnai1Recall: Math.round((gnai1?.afdb?.recall ?? 0) * 100),
    drd5Recall: Math.round((drd5?.afdb?.recall ?? 0) * 100),
    gnas: data.gAlphas.find(g => g.gene === 'GNAS'),
    olfactory: olfactory.map(p => p.gene),
    ipsaeRange: [Math.min(...ipsae), Math.max(...ipsae)].map(x => x.toFixed(2)),
    gnalVariants: gnal.variants
      .map(v => ({
        ...v,
        olfactory: v.partners.filter(p => OLFACTORY.test(p)),
      }))
      .filter(v => v.label === 'uncertain' && v.olfactory.length)
      .toSorted(
        (a, b) =>
          b.olfactory.length - a.olfactory.length ||
          (b.alphaMissense ?? 0) - (a.alphaMissense ?? 0),
      ),
  }
}
