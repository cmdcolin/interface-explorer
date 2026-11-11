import { expect, test } from 'vitest'

import { isLikelyPathogenic, parseScore } from './alphamissense.ts'

test('a substitution row', () => {
  expect(parseScore('P63092\tR201C\t0.9981\tpathogenic')).toEqual({
    accession: 'P63092',
    change: 'R201C',
    pathogenicity: 0.9981,
  })
})

test('the header and comment lines are not rows', () => {
  expect(
    parseScore('uniprot_id\tprotein_variant\tam_pathogenicity\tam_class'),
  ).toBeUndefined()
  expect(parseScore('# Copyright 2023 DeepMind Technologies')).toBeUndefined()
})

test('likely pathogenic is above the published threshold', () => {
  expect(isLikelyPathogenic(0.6)).toBe(true)
  expect(isLikelyPathogenic(0.564)).toBe(false)
  expect(isLikelyPathogenic(undefined)).toBe(false)
})
