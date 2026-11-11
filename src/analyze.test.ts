import { describe, expect, test } from 'vitest'

import { interfaceScore, mantelHaenszel, tables } from './analyze.ts'
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
  }
}

const PROTEIN: ProteinVariants = {
  accession: 'P1',
  gene: 'GENE',
  length: 10,
  complexes: 2,
  hetero: 2,
  interfaces: [
    {
      entity: 'AF-1',
      partner: 'P2',
      partner_gene: 'TWO',
      iptm: 0.8,
      ipsae: 0.7,
      pdockq: 0.5,
      residues: { '1': 90, '2': 50 },
    },
    {
      entity: 'AF-2',
      partner: 'P3',
      partner_gene: null,
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
  expect(interfaceScore(PROTEIN, 'iptm')).toEqual(
    new Map([
      [1, 0.8],
      [3, 0.6],
    ]),
  )
  expect(interfaceScore(PROTEIN, 'ipsae')).toEqual(
    new Map([
      [1, 0.7],
      [3, 0],
    ]),
  )
})

test('tables count variants at and away from the interface', () => {
  expect(tables([PROTEIN], 'iptm', 0.6)).toEqual([[1, 1, 1, 1]])
  expect(tables([PROTEIN], 'iptm', 0.7)).toEqual([[1, 1, 0, 2]])
  expect(
    tables([PROTEIN], 'iptm', 0.6, context => context !== undefined),
  ).toEqual([[1, 0, 1, 0]])
  expect(tables([PROTEIN], 'iptm', 0.6, () => false)).toEqual([])
})
