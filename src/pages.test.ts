import { expect, test } from 'vitest'

import { alphaMissenseCalls, geneRecord, leads, runs } from './pages.ts'

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
          modelled_as: null,
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
        conditions: [],
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
        conditions: [],
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

test('a lead is an uncertain variant where another substitution is pathogenic', () => {
  const variant = (
    position: number,
    change: string,
    label: 'pathogenic' | 'uncertain',
  ) => ({
    position,
    label,
    change,
    variation: position,
    review: '',
    chrom: '1',
    pos: position * 3,
    allele: 'C>T',
    conditions: label === 'pathogenic' ? ['Disease'] : [],
  })
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
          modelled_as: null,
          iptm: 0.8,
          ipsae: 0.7,
          pdockq: 0.5,
          residues: { 10: 90, 11: 90, 12: 90 },
        },
      ],
    },
    [
      variant(10, 'A10V', 'uncertain'),
      variant(10, 'A10D', 'pathogenic'),
      variant(11, 'L11P', 'pathogenic'),
      variant(12, 'G12S', 'uncertain'),
      variant(50, 'R50C', 'pathogenic'),
    ],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
  )
  expect(
    leads(record).map(lead => [
      lead.change,
      lead.sameResidue,
      lead.knownConditions,
      lead.pathogenicResidues,
      lead.entity,
    ]),
  ).toEqual([['A10V', ['A10D'], ['Disease'], 1, 'AF-1']])
})

test('a gene record carries its complex chain and UniProt features', () => {
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
          modelled_as: null,
          iptm: 0.8,
          ipsae: 0.7,
          pdockq: 0.5,
          residues: { 10: 90 },
        },
      ],
    },
    [],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
    new Map(),
    new Map(),
    new Map([['AF-1', 'B']]),
    [{ type: 'Domain', start: 5, end: 40, description: 'SH2' }],
  )
  expect(record.partners.map(p => p.chain)).toEqual(['B'])
  expect(record.features).toEqual([
    { type: 'Domain', start: 5, end: 40, description: 'SH2' },
  ])
})
