import { gene, gpcr } from './data.ts'
import { cgnName } from './maps.ts'
import type { Agreement } from './types.ts'

const OLFACTORY = /^OR\d/
const ALPHA5 = 'G.H5.'
const FEATURED = { pdb: '7JVQ', gAlpha: 'GNAS' }

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
  const gnas = data.gAlphas.find(g => g.gene === 'GNAS')
  const pathogenic = <V extends { label: string }>(list: V[]) => list.filter(v => v.label === 'pathogenic')
  const gnasPathogenic = pathogenic(gnas?.variants ?? [])
  const gnasCgn = data.cgn.GNAS
  const golfCgn = data.cgn.GNAL?.labels ?? {}
  const gnasByLabel = new Map(
    Object.entries(gnasCgn?.labels ?? {}).map(([position, label]) => [label, Number(position)]),
  )
  const gnasCounterpart = (golfPosition: number) => {
    const position = gnasByLabel.get(golfCgn[golfPosition] ?? '')
    return position ? `${gnasCgn?.sequence[position - 1]}${position}` : ''
  }
  const featured = data.complexes.find(c => c.pdb === FEATURED.pdb)
  const gnal = gene('GNAL')
  const olfactory = gnal.partners.filter(p => OLFACTORY.test(p.gene))
  const ipsae = olfactory.map(p => p.ipsae ?? 0)
  const or51e2Side = or51e2?.receptorSide
  const drd5Complex = dataset.find(
    c => c.receptorSide.gene === 'DRD5' && c.gAlphaAfdb,
  )
  const golf = or51e2?.gAlphaAfdb
  const golfExperimental = new Set(golf?.experimental)
  const golfPredicted = new Set(golf?.predictedResidues)
  const percentRange = (values: number[]) =>
    `${Math.round(Math.min(...values) * 100)}–${Math.round(Math.max(...values) * 100)}%`
  const ranges = (agreements: Agreement[]) => ({
    partners: agreements.map(r => r.partner),
    recall: percentRange(agreements.map(r => r.recall)),
    precision: percentRange(agreements.map(r => r.precision)),
  })
  return {
    complexes: dataset.length,
    golfReach: golf?.distances ?? {},
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
      golf: {
        experimental: golfExperimental.size,
        predicted: golfPredicted.size,
        shared: golf?.shared ?? 0,
        identity: Math.round((golf?.identity ?? 0) * 100),
        recall: Math.round((golf?.recall ?? 0) * 100),
        precision: Math.round((golf?.precision ?? 0) * 100),
        missed: [...golfExperimental].filter(r => !golfPredicted.has(r)),
        olfactory: ranges(
          (golf?.receptors ?? []).filter(
            r => OLFACTORY.test(r.partner) && r.partner !== 'OR51E2',
          ),
        ),
        others: ranges(
          (golf?.receptors ?? []).filter(r => !OLFACTORY.test(r.partner)),
        ),
      },
    },
    drd5Golf: {
      pdb: drd5Complex?.pdb ?? '',
      predicted: drd5Complex?.gAlphaAfdb?.predicted ?? 0,
      recall: Math.round((drd5Complex?.gAlphaAfdb?.recall ?? 0) * 100),
      precision: Math.round((drd5Complex?.gAlphaAfdb?.precision ?? 0) * 100),
      reach: drd5Complex?.gAlphaAfdb?.distances ?? {},
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
    gnas,
    gAlphaPathogenic: data.gAlphas.flatMap(g => pathogenic(g.variants)).length,
    receptorPathogenic: pathogenic(data.complexes.flatMap(c => c.receptorSide.variants)).length,
    all: data.complexes.length,
    gnasPathogenic: gnasPathogenic.length,
    gnasLabels: gnasCgn?.labels ?? {},
    alpha5Pathogenic: gnasPathogenic
      .filter(v => gnasCgn?.labels[v.position]?.startsWith(ALPHA5))
      .map(v => v.change),
    gnasPathogenicByElement: Map.groupBy(
      gnasPathogenic.map(v => ({ ...v, label: gnasCgn?.labels[v.position] ?? '' })),
      v => cgnName(v.label.split('.')[1] ?? ''),
    )
      .entries()
      .map(([element, variants]) => `${element}: ${variants.map(v => `${v.change} (${v.label})`).join(', ')}`)
      .toArray()
      .join('; '),
    golfCgn,
    gnasCounterpart,
    featured: {
      ...FEATURED,
      receptor: featured?.receptorSide.gene,
      pathogenic: pathogenic(featured?.gProteins.find(g => g.gene === FEATURED.gAlpha)?.variants ?? []).length,
    },
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
