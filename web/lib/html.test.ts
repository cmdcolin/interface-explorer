import { expect, test } from 'vitest'

import { conservedCell, phylopCell, pubmedHref, reportedCell } from './html.ts'

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

test('a reported cell names the evidence and links its papers and databases', () => {
  const partner = {
    accession: 'Q15369',
    homodimer: false,
    reported: {
      evidence: 'direct' as const,
      databases: ['IntAct' as const, 'BioGRID' as const],
      publications: ['32296183', 'doi:10.1/x'],
      methods: ['Two-hybrid'],
    },
    complexes: [
      { ac: 'CPX-1', name: 'VHL complex' },
      { ac: 'CPX-2', name: 'Other' },
    ],
    string: ['9606.A', '9606.B'] satisfies [string, string],
  }
  const cell = reportedCell('P40337', partner)
  expect(cell).toContain('>direct<')
  expect(cell).toContain('>2 papers<')
  expect(cell).toContain('32296183%5Buid%5D')
  expect(cell).toContain(
    'IntAct and BioGRID report this pair binding directly, by Two-hybrid',
  )
  expect(cell).toContain('id%3AP40337%20AND%20id%3AQ15369')
  expect(cell).toContain('string-db.org/interaction/9606.A/9606.B')
  expect(cell).toContain('complex/CPX-1')
  expect(cell).toContain('Complex Portal (2)')
  const bare = reportedCell('P40337', {
    accession: 'P40337',
    homodimer: true,
    complexes: [],
  })
  expect(bare).toContain('—')
  expect(bare).not.toContain('cell-note')
  expect(
    reportedCell('P40337', {
      ...partner,
      homodimer: true,
      accession: 'P40337',
    }),
  ).not.toContain('IntAct</a>')
  expect(pubmedHref(['doi:10.1/x'])).toBeUndefined()
})
