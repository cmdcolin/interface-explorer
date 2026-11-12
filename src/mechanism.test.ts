import { expect, test } from 'vitest'

import {
  geneClass,
  isTruncating,
  notHaploinsufficient,
  parseHaploinsufficiency,
  parseInheritance,
  variantInheritance,
} from './mechanism.ts'

const row = (disease: string, hpo: string, aspect: string) =>
  [disease, 'name', '', hpo, '', '', '', '', '', '', aspect, ''].join('\t')

test('a disease takes its one inheritance mode, and two modes leave it out', () => {
  const modes = parseInheritance(
    [
      row('OMIM:1', 'HP:0000006', 'I'),
      row('OMIM:2', 'HP:0000007', 'I'),
      row('OMIM:3', 'HP:0000006', 'I'),
      row('OMIM:3', 'HP:0000007', 'I'),
      row('OMIM:4', 'HP:0000006', 'P'),
    ].join('\n'),
  )
  expect(modes).toEqual(
    new Map([
      ['OMIM:1', 'dominant'],
      ['OMIM:2', 'recessive'],
    ]),
  )
  expect(variantInheritance(['OMIM:1', 'MONDO:9'], modes)).toBe('dominant')
  expect(variantInheritance(['OMIM:1', 'OMIM:2'], modes)).toBeUndefined()
  expect(variantInheritance([], modes)).toBeUndefined()
})

test('ClinGen haploinsufficiency scores are read by gene', () => {
  const scores = parseHaploinsufficiency(
    [
      '#Gene Symbol\tGene ID\tcytoBand\tGenomic Location\tHaploinsufficiency Score',
      'A4GALT\t53947\t22q13.2\tchr22:1-2\t30',
      'AAGAB\t79719\t15q23\tchr15:1-2\t3',
      'NEW\t1\t1p1\tchr1:1-2\tNot yet evaluated',
    ].join('\n'),
  )
  expect(scores).toEqual(
    new Map([
      ['A4GALT', 30],
      ['AAGAB', 3],
    ]),
  )
  expect([0, 1, 3, 30, 40, undefined].map(notHaploinsufficient)).toEqual([
    true,
    true,
    false,
    false,
    true,
    false,
  ])
})

test('truncations are stop-gains and frameshifts, and decide the gene class', () => {
  expect(isTruncating('NM_000546.6(TP53):c.916C>T (p.Arg306Ter)')).toBe(true)
  expect(isTruncating('NM_000546.6(TP53):c.455dup (p.Pro153fs)')).toBe(true)
  expect(isTruncating('NM_000546.6(TP53):c.818G>A (p.Arg273His)')).toBe(false)
  expect([0, 1, 2].map(geneClass)).toEqual([
    'missense-only',
    undefined,
    'truncation-pathogenic',
  ])
})
