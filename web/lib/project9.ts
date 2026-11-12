import { gene, gpcr } from './data.ts'

const OLFACTORY = /^OR\d/

export function project9() {
  const data = gpcr()
  const receptors = data.complexes.map(c => c.receptorSide)
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
  return {
    complexes: data.complexes.length,
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
