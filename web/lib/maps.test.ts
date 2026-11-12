import { expect, test } from 'vitest'

import { lanes, partnerGroups } from './maps.ts'

test('overlapping features take the next free lane', () => {
  expect(
    lanes([
      { start: 1, end: 65 },
      { start: 14, end: 53 },
      { start: 100, end: 155 },
      { start: 60, end: 70 },
    ]).map(({ item, lane }) => [item.start, lane]),
  ).toEqual([
    [1, 0],
    [14, 1],
    [60, 1],
    [100, 0],
  ])
})

test('partners touching nearly the same residues group under the one with most variants', () => {
  const partner = (gene: string, runs: string, variants: number) => ({
    gene,
    runs,
    variants,
  })
  const groups = partnerGroups([
    partner('RGS21', '10–19', 3),
    partner('RGS19', '10–19', 8),
    partner('GNB1', '40–49', 2),
  ])
  expect(groups.map(g => g.names)).toEqual([['RGS19', 'RGS21'], ['GNB1']])
})

test('a homodimer keeps its own group even when a paralog copies its interface', () => {
  const partner = (gene: string, runs: string, variants: number) => ({
    gene,
    runs,
    variants,
  })
  const groups = partnerGroups([
    { ...partner('SOD1', '10–19', 5), homodimer: true },
    partner('CCS', '10–19', 1),
  ])
  expect(groups.map(g => g.labels)).toEqual([['itself'], ['CCS']])
})
