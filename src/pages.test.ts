import { expect, test } from 'vitest'

import { diseaseOntology, parseObo } from './diseases.ts'
import {
  alphaMissenseCalls,
  diseaseRecords,
  distinctPairs,
  geneRecord,
  leads,
  runs,
} from './pages.ts'

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
      homo: 0,
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
        diseases: [],
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
        diseases: [],
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

test('a partner carries its patch rank, and an interface variant its phyloP', () => {
  const record = geneRecord(
    {
      accession: 'P00001',
      gene: 'GENE',
      length: 100,
      context: {},
      complexes: 1,
      hetero: 1,
      homo: 0,
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
        diseases: [],
        phylop: 6.4371,
      },
    ],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
    undefined,
    undefined,
    undefined,
    undefined,
    new Map([['AF-1', { anywhere: 0.93, nearby: 0.8 }]]),
  )
  expect(record.partners[0]?.conserved).toEqual({ anywhere: 0.93, nearby: 0.8 })
  expect(record.variants[0]?.phylop).toBe(6.44)
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
    pathogenic: { scored: 0, pp3: 0, bp4: 0 },
    uncertain: { scored: 2, pp3: 1, bp4: 0 },
    benign: { scored: 1, pp3: 0, bp4: 1 },
  })
})

test('a lead is an uncertain variant where the same or another substitution is pathogenic', () => {
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
    diseases: [],
  })
  const record = geneRecord(
    {
      accession: 'P00001',
      gene: 'GENE',
      length: 100,
      context: {},
      complexes: 1,
      hetero: 1,
      homo: 0,
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
      variant(11, 'L11P', 'uncertain'),
      variant(12, 'G12S', 'uncertain'),
      variant(50, 'R50C', 'pathogenic'),
    ],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
  )
  expect(
    leads(record).map(lead => [
      lead.change,
      lead.evidence,
      lead.sameResidue,
      lead.knownConditions,
      lead.pathogenicResidues,
      lead.partner,
      lead.entity,
    ]),
  ).toEqual([
    ['A10V', 'PM5', ['A10D'], ['Disease'], 1, 'PARTNER', 'AF-1'],
    ['L11P', 'PS1', ['L11P'], ['Disease'], 1, 'PARTNER', 'AF-1'],
  ])
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
      homo: 0,
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

test('totals count every classified variant, counts only those at an interface', () => {
  const variant = (position: number, label: 'pathogenic' | 'benign') => ({
    position,
    label,
    change: `A${position}V`,
    variation: position,
    review: '',
    chrom: '1',
    pos: position * 3,
    allele: 'C>T',
    conditions: [],
    diseases: [],
  })
  const record = geneRecord(
    {
      accession: 'P00001',
      gene: 'GENE',
      length: 100,
      context: {},
      complexes: 1,
      hetero: 1,
      homo: 0,
      interfaces: [
        {
          entity: 'AF-1',
          partner: 'P00002',
          partner_gene: 'PARTNER',
          modelled_as: null,
          iptm: 0.8,
          ipsae: 0.9,
          pdockq: 0.5,
          residues: { 10: 90 },
        },
      ],
    },
    [
      variant(10, 'pathogenic'),
      variant(20, 'pathogenic'),
      variant(30, 'benign'),
    ],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
  )
  expect(record.totals).toEqual({ pathogenic: 2, uncertain: 0, benign: 1 })
  expect(record.counts).toEqual({ pathogenic: 1, uncertain: 0, benign: 0 })
})

test('a lead on a pair that never shares a compartment is marked apart', () => {
  const variant = (change: string, label: 'pathogenic' | 'uncertain') => ({
    position: 10,
    label,
    change,
    variation: label === 'pathogenic' ? 1 : 2,
    review: '',
    chrom: '1',
    pos: 30,
    allele: 'C>T',
    conditions: [],
    diseases: [],
  })
  const record = geneRecord(
    {
      accession: 'P00001',
      gene: 'GENE',
      length: 100,
      context: {},
      complexes: 1,
      hetero: 1,
      homo: 0,
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
    [variant('A10D', 'pathogenic'), variant('A10V', 'uncertain')],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
    new Map(),
    new Map(),
    new Map(),
    [],
    new Map(),
    new Map([
      ['P00001', { family: 'F family', locations: ['Cytoplasm'] }],
      ['P00002', { family: 'F family', locations: ['Mitochondrion matrix'] }],
    ]),
  )
  expect(record.partners.map(p => [p.gene, p.apart, p.paralogs])).toEqual([
    ['PARTNER', true, true],
  ])
  expect(leads(record).map(lead => [lead.change, lead.apart])).toEqual([
    ['A10V', true],
  ])
})

test('a pair flagged from both of its genes counts once', () => {
  const partner = (accession: string, apart: boolean) => ({
    gene: accession,
    accession,
    modelledAs: null,
    ipsae: 0.7,
    iptm: 0.8,
    pdockq: 0.5,
    entity: 'AF-1',
    chain: undefined,
    residues: 1,
    runs: '1',
    experiment: undefined,
    conserved: undefined,
    reported: undefined,
    complexes: [],
    string: undefined,
    apart,
    paralogs: false,
    homodimer: false,
    variants: 0,
  })
  expect(
    distinctPairs(
      [
        {
          accession: 'P1',
          partners: [partner('P2', true), partner('P3', false)],
        },
        { accession: 'P2', partners: [partner('P1', true)] },
      ],
      p => p.apart,
    ),
  ).toBe(1)
})

test('a homodimer is the protein paired with itself, never its own paralog', () => {
  const record = geneRecord(
    {
      accession: 'P00001',
      gene: 'GENE',
      length: 100,
      context: {},
      complexes: 1,
      hetero: 0,
      homo: 1,
      interfaces: [
        {
          entity: 'AF-1',
          partner: 'P00001',
          partner_gene: 'GENE',
          modelled_as: null,
          iptm: 0.8,
          ipsae: 0.8,
          pdockq: 0.5,
          residues: { 10: 90 },
        },
      ],
    },
    [],
    { chrom: 'chr1', strand: '+', start: 1, end: 300 },
    new Map(),
    new Map(),
    new Map(),
    [],
    new Map(),
    new Map([['P00001', { family: 'F family', locations: ['Cytoplasm'] }]]),
  )
  expect(
    record.partners.map(p => [p.gene, p.homodimer, p.paralogs, p.apart]),
  ).toEqual([['GENE', true, false, false]])
})

test('a variant whose condition its partner also causes is linked, and a disease page counts the pair once', () => {
  const ontology = diseaseOntology(
    parseObo(`[Term]
id: MONDO:0000010
name: complex deficiency
xref: OMIMPS:100000

[Term]
id: MONDO:0000011
name: complex deficiency 1
xref: OMIM:100001
is_a: MONDO:0000010

[Term]
id: MONDO:0000012
name: complex deficiency 2
xref: OMIM:100002
is_a: MONDO:0000010
`),
  )
  const uniprot = new Map([
    ['P00001', [{ name: 'Complex deficiency 1', omim: 'OMIM:100001' }]],
    ['P00002', [{ name: 'Complex deficiency 2', omim: 'OMIM:100002' }]],
  ])
  const gene = (
    accession: string,
    name: string,
    partner: string,
    partnerGene: string,
    disease: string,
  ) => ({
    ...geneRecord(
      {
        accession,
        gene: name,
        length: 100,
        context: {},
        complexes: 1,
        hetero: 1,
        homo: 0,
        interfaces: [
          {
            entity: `AF-${name}`,
            partner,
            partner_gene: partnerGene,
            modelled_as: null,
            iptm: 0.8,
            ipsae: 0.8,
            pdockq: 0.5,
            residues: { 10: 90 },
          },
        ],
      },
      [
        {
          position: 10,
          label: 'pathogenic',
          change: 'A10D',
          variation: Number(accession.slice(1)),
          review: '',
          chrom: '1',
          pos: 30,
          allele: 'C>T',
          conditions: [name],
          diseases: [disease],
        },
      ],
      { chrom: 'chr1', strand: '+', start: 1, end: 300 },
      new Map(),
      new Map(),
      new Map(),
      [],
      new Map(),
      new Map(),
      (variant, accession) =>
        ontology.shared(variant.diseases, uniprot.get(accession) ?? []),
    ),
    page: name,
  })
  const a = gene('P00001', 'A', 'P00002', 'B', 'OMIM:100001')
  const b = gene('P00002', 'B', 'P00001', 'A', 'MONDO:0000012')
  expect(a.variants[0]?.partnerDiseases).toEqual([
    {
      partner: 'B',
      disease: 'Complex deficiency 2',
      series: { name: 'complex deficiency', size: 2 },
    },
  ])
  const pages = diseaseRecords([a, b], ontology, uniprot)
  const series = pages.find(d => d.id === 'MONDO:0000010')
  expect(series?.genes.map(g => g.gene)).toEqual(['A', 'B'])
  expect(series?.pairs).toEqual([
    {
      gene: 'A',
      page: 'A',
      partner: 'B',
      accession: 'P00002',
      ipsae: 0.8,
      pathogenic: 2,
      uncertain: 0,
      benign: 0,
    },
  ])
  expect(pages.find(d => d.id === 'MONDO:0000011')?.pairs).toEqual([])
})
