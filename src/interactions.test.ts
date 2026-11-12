import { expect, test } from 'vitest'

import {
  biogridReports,
  collect,
  descendsFrom,
  intactReport,
  pairKey,
  parseObo,
  publicationOf,
} from './interactions.ts'

const OBO = `format-version: 1.2

[Term]
id: MI:0914
name: association

[Term]
id: MI:0915
name: physical association
is_a: MI:0914 ! association

[Term]
id: MI:0407
name: direct interaction
is_a: MI:0915 ! physical association

[Term]
id: MI:0403
name: colocalization

[Term]
id: MI:0090
name: protein complementation assay

[Term]
id: MI:0018
name: two hybrid
is_a: MI:0090 ! protein complementation assay

[Term]
id: MI:0397
name: two hybrid array
is_a: MI:0018 ! two hybrid

[Term]
id: MI:0007
name: anti tag coimmunoprecipitation

[Term]
id: MI:1313
name: proximity labelling technology

[Term]
id: MI:1314
name: proximity-dependent biotin identification
is_a: MI:1313 ! proximity labelling technology

[Typedef]
id: part_of
is_a: MI:0914
`

const PARENTS = parseObo(OBO)

function intactRow({
  a = 'uniprotkb:P04637',
  b = 'uniprotkb:Q00987',
  method = 'psi-mi:"MI:0007"(anti tag coimmunoprecipitation)',
  publications = 'pubmed:12345|imex:IM-1',
  taxa = 'taxid:9606(human)|taxid:9606(Homo sapiens)',
  type = 'psi-mi:"MI:0915"(physical association)',
  negative = 'false',
} = {}) {
  const fields = Array.from({ length: 42 }, () => '-')
  fields[0] = a
  fields[1] = b
  fields[6] = method
  fields[8] = publications
  fields[9] = taxa
  fields[10] = taxa
  fields[11] = type
  fields[35] = negative
  return fields
}

function biogridRow({
  system = 'Two-hybrid',
  type = 'physical',
  organisms = ['9606', '9606'],
  publication = 'PUBMED:32296183',
  a = 'P04637',
  b = 'Q00987|Q9XXXX',
} = {}) {
  const fields = Array.from({ length: 37 }, () => '-')
  fields[1] = '7157'
  fields[2] = '1019'
  fields[11] = system
  fields[12] = type
  fields[14] = publication
  fields[15] = organisms[0] ?? ''
  fields[16] = organisms[1] ?? ''
  fields[23] = a
  fields[26] = b
  return fields
}

test('the ontology gives each term its parents, and descent follows them up', () => {
  expect(PARENTS.get('MI:0397')).toEqual(['MI:0018'])
  expect(PARENTS.has('part_of')).toBe(false)
  expect(descendsFrom(PARENTS, 'MI:0397', 'MI:0090')).toBe(true)
  expect(descendsFrom(PARENTS, 'MI:0407', 'MI:0914')).toBe(true)
  expect(descendsFrom(PARENTS, 'MI:0403', 'MI:0914')).toBe(false)
})

test('a pair key is the same in either order', () => {
  expect(pairKey('Q00987', 'P04637')).toBe(pairKey('P04637', 'Q00987'))
})

test('a PubMed ID is preferred over the other publication IDs', () => {
  expect(publicationOf('imex:IM-1|pubmed:12345')).toBe('12345')
  expect(publicationOf('doi:10.1/x')).toBe('doi:10.1/x')
})

test('IntAct co-purification is same-complex evidence, on the canonical accessions', () => {
  expect(
    intactReport(
      intactRow({ a: 'uniprotkb:P04637-2', b: 'uniprotkb:Q00987-PRO_1' }),
      PARENTS,
    ),
  ).toEqual({
    accessions: ['P04637', 'Q00987'],
    evidence: 'complex',
    method: 'anti tag coimmunoprecipitation',
    publication: '12345',
  })
})

test('IntAct calls a pair direct by its interaction type or a binary method', () => {
  expect(
    intactReport(
      intactRow({ type: 'psi-mi:"MI:0407"(direct interaction)' }),
      PARENTS,
    )?.evidence,
  ).toBe('direct')
  expect(
    intactReport(
      intactRow({ method: 'psi-mi:"MI:0397"(two hybrid array)' }),
      PARENTS,
    )?.evidence,
  ).toBe('direct')
})

test('IntAct rows that are not evidence of two human proteins binding are skipped', () => {
  const skipped = [
    { type: 'psi-mi:"MI:0403"(colocalization)' },
    { method: 'psi-mi:"MI:1314"(proximity-dependent biotin identification)' },
    { negative: 'true' },
    { taxa: 'taxid:10090(mouse)' },
    { b: 'chebi:"CHEBI:15422"' },
  ]
  for (const row of skipped) {
    expect(intactReport(intactRow(row), PARENTS)).toBeUndefined()
  }
})

test('a protein reported binding itself is a homodimer pair', () => {
  expect(
    intactReport(intactRow({ b: 'uniprotkb:P04637' }), PARENTS)?.accessions,
  ).toEqual(['P04637', 'P04637'])
  const self = biogridRow({ a: 'P04637|P11111', b: 'P04637|P11111' })
  self[1] = '7157'
  self[2] = '7157'
  expect(biogridReports(self).map(r => r.accessions)).toEqual([
    ['P04637', 'P04637'],
    ['P11111', 'P11111'],
  ])
})

test('BioGRID gives one report per pair of Swiss-Prot accessions', () => {
  expect(biogridReports(biogridRow())).toEqual([
    {
      accessions: ['P04637', 'Q00987'],
      evidence: 'direct',
      method: 'Two-hybrid',
      publication: '32296183',
    },
    {
      accessions: ['P04637', 'Q9XXXX'],
      evidence: 'direct',
      method: 'Two-hybrid',
      publication: '32296183',
    },
  ])
  expect(
    biogridReports(
      biogridRow({ system: 'Affinity Capture-MS', publication: 'DOI:10.1/x' }),
    )[0],
  ).toMatchObject({ evidence: 'complex', publication: 'doi:10.1/x' })
})

test('BioGRID proximity labelling, genetic and non-human rows are skipped', () => {
  expect(biogridReports(biogridRow({ system: 'Proximity Label-MS' }))).toEqual(
    [],
  )
  expect(
    biogridReports(biogridRow({ system: 'Negative Genetic', type: 'genetic' })),
  ).toEqual([])
  expect(biogridReports(biogridRow({ organisms: ['9606', '10090'] }))).toEqual(
    [],
  )
  expect(biogridReports(biogridRow({ a: '-' }))).toEqual([])
})

test('a pair is direct when any report is, and keeps every publication', async () => {
  const found = await collect(
    [
      ...biogridReports(biogridRow({ system: 'Affinity Capture-MS' })),
      ...biogridReports(biogridRow({ b: 'Q00987', publication: 'PUBMED:999' })),
      ...biogridReports(
        biogridRow({ a: 'P11111', b: 'P22222', system: 'Co-fractionation' }),
      ),
    ],
    new Set([pairKey('P04637', 'Q00987'), pairKey('P11111', 'P22222')]),
  )
  expect(found.get(pairKey('P04637', 'Q00987'))).toEqual({
    evidence: 'direct',
    publications: ['32296183', '999'],
    methods: ['Affinity Capture-MS', 'Two-hybrid'],
  })
  expect(found.get(pairKey('P11111', 'P22222'))?.evidence).toBe('complex')
  expect(found.has(pairKey('P04637', 'Q9XXXX'))).toBe(false)
})
