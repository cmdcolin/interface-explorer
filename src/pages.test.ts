import { expect, test } from 'vitest'

import { alphaMissenseCalls, geneRecord, runs } from './pages.ts'

test('consecutive residues collapse into runs', () => {
  expect(runs([5, 1, 2, 3, 7, 8, 10])).toBe('1–3, 5, 7–8, 10')
})

test('repeated residues', () => {
  expect(runs([1, 1, 2])).toBe('1–2')
})

test('no residues', () => {
  expect(runs([])).toBe('')
})

test('an interface variant carries its AlphaMissense score', () => {
  const record = geneRecord(
    {
      accession: 'P00001',
      gene: 'GENE',
      length: 100,
      context: {},
      complexes: 1,
      hetero: 1,
      interfaces: [
        {
          entity: 'AF-1',
          partner: 'P00002',
          partner_gene: 'PARTNER',
          iptm: 0.8,
          ipsae: 0.7,
          pdockq: 0.5,
          residues: { 10: 90, 11: 90 },
        },
      ],
    },
    [
      {
        position: 10,
        label: 'uncertain',
        change: 'A10V',
        variation: 1,
        review: '',
        chrom: '1',
        pos: 100,
        allele: 'C>T',
      },
      {
        position: 11,
        label: 'uncertain',
        change: 'L11P',
        variation: 2,
        review: '',
        chrom: '1',
        pos: 103,
        allele: 'T>C',
      },
    ],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
    new Map([['L11P', 0.97]]),
  )
  expect(record.variants.map(v => [v.change, v.alphaMissense])).toEqual([
    ['A10V', undefined],
    ['L11P', 0.97],
  ])
})

test('AlphaMissense calls are counted per ClinVar label, over scored variants', () => {
  expect(
    alphaMissenseCalls([
      { label: 'uncertain', alphaMissense: 0.9 },
      { label: 'uncertain', alphaMissense: 0.2 },
      { label: 'uncertain' },
      { label: 'benign', alphaMissense: 0.1 },
    ]),
  ).toEqual({
    pathogenic: { scored: 0, likelyPathogenic: 0 },
    uncertain: { scored: 2, likelyPathogenic: 1 },
    benign: { scored: 1, likelyPathogenic: 0 },
  })
})
