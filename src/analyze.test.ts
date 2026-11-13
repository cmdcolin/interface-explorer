import { describe, expect, test } from 'vitest'

import {
  ALPHAMISSENSE_CLASSES,
  armProteins,
  bands,
  byEvidence,
  byMetric,
  byRegion,
  interfaceScore,
  mantelHaenszel,
  mechanismArms,
  regionOf,
  stratifiedEnrichment,
  tables,
} from './analyze.ts'
import type { ProteinVariants } from './analyze.ts'
import type { Variant } from './variants.ts'

describe('mantelHaenszel', () => {
  test('a single table is the odds ratio', () => {
    expect(mantelHaenszel([[10, 5, 4, 8]])).toBe(4)
  })

  test('pools tables weighted by size', () => {
    const numerator = (10 * 8) / 27 + (3 * 9) / 21
    const denominator = (5 * 4) / 27 + (7 * 2) / 21
    const pooled = mantelHaenszel([
      [10, 5, 4, 8],
      [3, 7, 2, 9],
    ])
    expect(pooled).toBeCloseTo(numerator / denominator)
    expect(pooled).toBeCloseTo(803 / 266)
  })

  test('no tables is NaN', () => {
    expect(mantelHaenszel([])).toBeNaN()
  })

  test('no discordant benign is infinite', () => {
    expect(mantelHaenszel([[3, 0, 0, 4]])).toBe(Infinity)
  })
})

function variant(position: number, label: Variant['label']): Variant {
  return {
    position,
    label,
    change: `X${position}Y`,
    variation: position,
    review: '',
    chrom: '1',
    pos: position,
    allele: 'A',
    conditions: [],
    diseases: [],
  }
}

const PROTEIN: ProteinVariants = {
  accession: 'P1',
  gene: 'GENE',
  length: 10,
  complexes: 2,
  hetero: 2,
  homo: 0,
  interfaces: [
    {
      entity: 'AF-1',
      partner: 'P2',
      partner_gene: 'TWO',
      modelled_as: null,
      iptm: 0.8,
      ipsae: 0.7,
      pdockq: 0.5,
      residues: { '1': 90, '2': 50 },
    },
    {
      entity: 'AF-2',
      partner: 'P3',
      partner_gene: null,
      modelled_as: null,
      iptm: 0.6,
      ipsae: null,
      pdockq: null,
      residues: { '1': 80, '3': 75 },
    },
  ],
  context: { '1': [90, 0.5], '3': [75, 0.1] },
  variants: [
    variant(1, 'pathogenic'),
    variant(2, 'pathogenic'),
    variant(3, 'benign'),
    variant(4, 'benign'),
  ],
}

test('interface score keeps the best score among confident residues', () => {
  expect(interfaceScore(PROTEIN, byMetric('iptm'))).toEqual(
    new Map([
      [1, 0.8],
      [3, 0.6],
    ]),
  )
  expect(interfaceScore(PROTEIN, byMetric('ipsae'))).toEqual(
    new Map([
      [1, 0.7],
      [3, 0],
    ]),
  )
})

test('bands pair consecutive edges', () => {
  expect(bands([0.6, 0.7, Infinity])).toEqual([
    [0.6, 0.7],
    [0.7, Infinity],
  ])
})

test('tables compare a confidence band with residues at no interface', () => {
  expect(tables([PROTEIN], byMetric('iptm'), [0.6, Infinity])).toEqual([
    [1, 1, 1, 1],
  ])
  expect(tables([PROTEIN], byMetric('iptm'), [0.6, 0.7])).toEqual([
    [0, 1, 1, 1],
  ])
  expect(tables([PROTEIN], byMetric('iptm'), [0.7, Infinity])).toEqual([
    [1, 1, 0, 1],
  ])
  expect(
    tables(
      [PROTEIN],
      byMetric('iptm'),
      [0.6, Infinity],
      context => context !== undefined,
    ),
  ).toEqual([[1, 0, 1, 0]])
  expect(
    tables([PROTEIN], byMetric('iptm'), [0.6, Infinity], () => false),
  ).toEqual([])
})

test('tables can be restricted to an AlphaMissense class', () => {
  const scored = {
    ...PROTEIN,
    variants: PROTEIN.variants.map((v, i) => ({
      ...v,
      alphaMissense: [0.95, 0.2, 0.85, 0.8][i],
    })),
  }
  expect(
    tables(
      [scored],
      byMetric('iptm'),
      [0.6, Infinity],
      ALPHAMISSENSE_CLASSES['AlphaMissense PP3 (≥ 0.792)'],
    ),
  ).toEqual([[1, 0, 1, 1]])
})

test('evidence bands rank each residue by its best-supported confident partner', () => {
  const interactions = new Map([
    [
      'P1 P2',
      {
        evidence: 'direct' as const,
        databases: [],
        publications: ['1'],
        methods: [],
      },
    ],
  ])
  expect(interfaceScore(PROTEIN, byEvidence(interactions))).toEqual(
    new Map([
      [1, 2],
      [3, -1],
    ]),
  )
  expect(interfaceScore(PROTEIN, byEvidence(new Map()))).toEqual(
    new Map([
      [1, 0],
      [3, -1],
    ]),
  )
  expect(tables([PROTEIN], byEvidence(interactions), [2, 3])).toEqual([
    [1, 1, 0, 1],
  ])
  expect(tables([PROTEIN], byEvidence(interactions), [0, 1])).toEqual([
    [0, 1, 0, 1],
  ])
})

test('a mechanism arm keeps its gene class and its inheritance mode', () => {
  const arms = mechanismArms({
    genes: {
      [PROTEIN.gene]: { class: 'missense-only', haploinsufficiency: 0 },
    },
    inheritance: { 'OMIM:1': 'dominant', 'OMIM:2': 'recessive' },
  })
  const protein = {
    ...PROTEIN,
    variants: PROTEIN.variants.map((v, i) => ({
      ...v,
      diseases: [i % 2 ? 'OMIM:2' : 'OMIM:1'],
    })),
  }
  const dominant = arms['missense-only genes, dominant variants']
  const truncating = arms['truncation-pathogenic genes']
  expect(
    dominant &&
      armProteins([protein], dominant)[0]?.variants.map(v => v.diseases),
  ).toEqual(protein.variants.filter((_, i) => i % 2 === 0).map(v => v.diseases))
  expect(truncating && armProteins([protein], truncating)).toEqual([])
  expect(Object.keys(arms)).toHaveLength(12)
})

test('a residue is at an interface first, then placed by its single-chain model', () => {
  expect(regionOf([40, 0.1], true)).toBe('interface')
  expect(regionOf(undefined, false)).toBe('no single-chain model')
  expect(regionOf([40, 0.1], false)).toBe('low confidence')
  expect(regionOf([90, 0.1], false)).toBe('buried core')
  expect(regionOf([90, 0.5], false)).toBe('exposed surface')
})

test('regions count each label and the variants at a UniProt site', () => {
  const protein = {
    ...PROTEIN,
    context: {
      ...PROTEIN.context,
      '1': [90, 0.1] satisfies [number, number],
      '4': [90, 0.6] satisfies [number, number],
    },
  }
  const result = byRegion(
    [protein],
    new Map([
      [
        'P1',
        [{ type: 'Active site' as const, start: 3, end: 3, description: '' }],
      ],
    ]),
  )
  expect(result.regions.interface).toEqual({
    pathogenic: 1,
    benign: 0,
    uncertain: 0,
    'at a UniProt site': { pathogenic: 0, benign: 0, uncertain: 0 },
  })
  expect(result.regions['buried core']['at a UniProt site'].benign).toBe(1)
  expect(result.regions['exposed surface'].benign).toBe(1)
  expect(result.regions['no single-chain model'].pathogenic).toBe(1)
  expect(result['exposed surface genes']).toEqual([])
  expect(result['interface residues the single chain buries'].pathogenic).toBe(
    1,
  )
})

test('a protein with no variant at the interface is not informative', () => {
  expect(
    stratifiedEnrichment([[[1, 2, 0, 3]], [[0, 2, 0, 3]]])[
      'proteins informative'
    ],
  ).toBe(1)
})
