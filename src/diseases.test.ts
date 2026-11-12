import { describe, expect, test } from 'vitest'

import { diseaseOntology, parseObo } from './diseases.ts'

const OBO = `format-version: 1.2

[Term]
id: MONDO:0000001
name: disease

[Term]
id: MONDO:0000010
name: mitochondrial complex I deficiency, nuclear type
xref: OMIMPS:252010 {source="MONDO:equivalentTo"}
is_a: MONDO:0000001 ! disease

[Term]
id: MONDO:0000011
name: mitochondrial complex I deficiency, nuclear type 5
xref: OMIM:618226 {source="MONDO:equivalentTo"}
is_a: MONDO:0000010 ! series

[Term]
id: MONDO:0000012
name: mitochondrial complex I deficiency, nuclear type 13
xref: OMIM:618249 {source="MONDO:equivalentTo"}
is_a: MONDO:0000010 ! series

[Term]
id: MONDO:0000020
name: Leigh syndrome
xref: OMIM:256000
is_a: MONDO:0000001 ! disease

[Term]
id: MONDO:0000099
name: obsolete thing
is_obsolete: true

[Typedef]
id: part_of
name: part of
`

describe('parseObo', () => {
  test('reads names, parents and OMIM cross-references, phenotypic series as OMIM:PS', () => {
    const terms = parseObo(OBO)
    expect(terms.get('MONDO:0000010')).toEqual({
      name: 'mitochondrial complex I deficiency, nuclear type',
      parents: ['MONDO:0000001'],
      omim: ['OMIM:PS252010'],
    })
    expect(terms.has('MONDO:0000099')).toBe(false)
    expect(terms.has('part_of')).toBe(false)
  })
})

describe('diseaseOntology', () => {
  const ontology = diseaseOntology(parseObo(OBO))
  const partner = [
    {
      name: 'Mitochondrial complex I deficiency, nuclear type 5',
      omim: 'OMIM:618226',
    },
    { name: 'Leigh syndrome', omim: 'OMIM:256000' },
  ]

  test('a partner disease that is the variant’s condition is the same disease', () => {
    expect(ontology.shared(['MONDO:0000020'], partner)).toEqual([
      { disease: 'Leigh syndrome' },
    ])
  })

  test('a partner disease in the same phenotypic series names the series and its size', () => {
    expect(ontology.shared(['OMIM:618249'], partner)).toEqual([
      {
        disease: 'Mitochondrial complex I deficiency, nuclear type 5',
        series: {
          name: 'mitochondrial complex I deficiency, nuclear type',
          size: 2,
        },
      },
    ])
  })

  test('a condition named as the series matches its members', () => {
    expect(ontology.shared(['OMIM:PS252010'], partner)).toHaveLength(1)
  })

  test('sharing only a broad ancestor is no match', () => {
    expect(ontology.shared(['MONDO:0000012'], partner.slice(1))).toEqual([])
  })

  test('concepts are the resolved terms and their series', () => {
    expect(ontology.concepts(['OMIM:618249', 'MONDO:0009999']).sort()).toEqual([
      'MONDO:0000010',
      'MONDO:0000012',
    ])
  })
})

test('a series reached only through an intermediate term is no match', () => {
  const ontology = diseaseOntology(
    parseObo(`[Term]
id: MONDO:0000001
name: big series
xref: OMIMPS:100000

[Term]
id: MONDO:0000002
name: grouping
is_a: MONDO:0000001

[Term]
id: MONDO:0000003
name: disease a
xref: OMIM:100001
is_a: MONDO:0000002

[Term]
id: MONDO:0000004
name: disease b
xref: OMIM:100002
is_a: MONDO:0000001
`),
  )
  expect(
    ontology.shared(['OMIM:100001'], [{ name: 'B', omim: 'OMIM:100002' }]),
  ).toEqual([])
  expect(ontology.size('MONDO:0000001')).toBe(1)
})
