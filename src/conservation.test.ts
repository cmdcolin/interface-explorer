import { expect, test } from 'vitest'

import { bootstrap, enrichment, stratifiedEnrichment } from './analyze.ts'
import type { ProteinVariants, Table } from './analyze.ts'
import {
  baseScores,
  complexDifferences,
  matchedDifference,
  matchedTables,
  quarter,
  quartileEdges,
  variantScore,
} from './conservation.ts'
import type { CodingPositions } from './coordinates.ts'
import type { Variant } from './variants.ts'

function variant(position: number, pos: number, label: Variant['label']) {
  return {
    position,
    label,
    change: `X${position}Y`,
    variation: position,
    review: '',
    chrom: '1',
    pos,
    allele: 'A>G',
    conditions: [],
  } satisfies Variant
}

const REVERSE: CodingPositions = {
  chrom: 'chr1',
  strand: '-',
  start: 101,
  end: 106,
  locus: 'chr1:101-106',
  codon: residue => (residue === 1 ? [105, 104, 103] : [102, 101, 100]),
}

test('base scores fill each base of a span, clipped to the query', () => {
  expect(
    baseScores(
      [
        { start: 8, end: 11, score: 2 },
        { start: 11, end: 12, score: -1 },
        { start: 12, end: 13 },
      ],
      10,
      13,
    ),
  ).toEqual(
    new Map([
      [10, 2],
      [11, -1],
    ]),
  )
})

test("a variant takes its own base's score, given 1-based ClinVar positions", () => {
  const scores = [
    [5, 6, 7],
    [1, 2, null],
  ]
  expect(variantScore(variant(1, 105, 'benign'), REVERSE, scores)).toBe(6)
  expect(variantScore(variant(2, 103, 'benign'), REVERSE, scores)).toBe(1)
  expect(variantScore(variant(2, 101, 'benign'), REVERSE, scores)).toBe(
    undefined,
  )
  expect(variantScore(variant(2, 200, 'benign'), REVERSE, scores)).toBe(
    undefined,
  )
})

test('quartile edges split scores into four groups', () => {
  const edges = quartileEdges([9, 1, 5, 3, 7])
  expect(edges).toEqual([3, 5, 7])
  expect([1, 3, 4, 5, 8, 9].map(s => quarter(edges, s))).toEqual([
    0, 1, 1, 2, 3, 3,
  ])
})

test('matched difference compares each residue with its own stratum', () => {
  expect(
    matchedDifference(
      [
        { stratum: 'a', score: 4 },
        { stratum: 'b', score: 1 },
        { stratum: 'c', score: 9 },
      ],
      [
        { stratum: 'a', score: 1 },
        { stratum: 'a', score: 3 },
        { stratum: 'b', score: 2 },
      ],
    ),
  ).toEqual({ residues: 2, difference: (4 - 2 + (1 - 2)) / 2 })
  expect(matchedDifference([{ stratum: 'a', score: 1 }], [])).toEqual({
    residues: 0,
    difference: NaN,
  })
})

const SURFACE_PROTEIN: ProteinVariants = {
  accession: 'P1',
  gene: 'GENE',
  length: 14,
  complexes: 2,
  hetero: 2,
  interfaces: [
    {
      entity: 'AF-1',
      partner: 'P2',
      partner_gene: 'TWO',
      iptm: 0.8,
      ipsae: 0.75,
      pdockq: null,
      residues: { '1': 90, '2': 90, '3': 90, '4': 90, '5': 90, '6': 50 },
    },
    {
      entity: 'AF-2',
      partner: 'P3',
      partner_gene: 'THREE',
      iptm: 0.8,
      ipsae: 0.65,
      pdockq: null,
      residues: { '7': 90 },
    },
  ],
  context: Object.fromEntries(
    Array.from({ length: 14 }, (_, i) => [
      String(i + 1),
      [i + 1 === 13 ? 50 : 95, i + 1 === 14 ? 0.1 : 0.5],
    ]),
  ),
  variants: [],
}

test('a complex is compared with surface residues at no confident interface', () => {
  const scores = Array.from({ length: 14 }, (_, i) =>
    i < 5 ? [3, 3, 3] : i === 6 ? [9, 9, 9] : i >= 12 ? [8, 8, 8] : [1, 1, 1],
  )
  expect(complexDifferences(SURFACE_PROTEIN, scores)).toEqual([
    { entity: 'AF-1', ipsae: 0.75, difference: 2 },
  ])
})

test('matched tables keep one group of strata per protein', () => {
  const protein: ProteinVariants = {
    ...SURFACE_PROTEIN,
    variants: [
      { ...variant(1, 0, 'pathogenic'), phylop: 0.5 },
      { ...variant(9, 0, 'benign'), phylop: 1.5 },
      { ...variant(2, 0, 'pathogenic'), phylop: 1.5 },
      { ...variant(10, 0, 'benign'), phylop: 2 },
      { ...variant(11, 0, 'pathogenic'), phylop: 1 },
      variant(12, 0, 'benign'),
    ],
  }
  expect(matchedTables([protein], () => true, [1, 2.5, 3])).toEqual([
    [[1, 1, 0, 2]],
  ])
})

test('stratified enrichment resamples proteins, not their strata', () => {
  const rows: Table[] = [
    [4, 1, 1, 4],
    [3, 2, 2, 3],
    [5, 1, 2, 2],
  ]
  expect(stratifiedEnrichment(rows.map(row => [row]))).toEqual(enrichment(rows))
  expect(stratifiedEnrichment([rows, rows, rows])['proteins informative']).toBe(
    3,
  )
  expect(bootstrap([rows, rows, rows])).toEqual(bootstrap([rows]))
})
