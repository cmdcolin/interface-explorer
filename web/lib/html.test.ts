import { expect, test } from 'vitest'

import { conservedCell, phylopCell } from './html.ts'

test('a phyloP cell names the quarter of conservation', () => {
  expect(phylopCell(8.04, [1.54, 4.58, 7.61])).toContain(
    'the most conserved quarter',
  )
  expect(phylopCell(-0.5, [1.54, 4.58, 7.61])).toContain(
    'the least conserved quarter',
  )
  expect(phylopCell(undefined, [1.54, 4.58, 7.61])).toContain('—')
})

test('a conserved cell gives the share of patches the interface beats', () => {
  expect(conservedCell({ anywhere: 0.934, nearby: 0.8 })).toContain('>93%<')
  expect(conservedCell({ anywhere: 0.934, nearby: 0.8 })).toContain(
    '80% of those within 25 Å',
  )
  expect(conservedCell(undefined)).toContain('—')
})
