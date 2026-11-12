import { expect, test } from 'vitest'

import { parseScore } from './alphamissense.ts'
import { alphaMissenseEvidence } from './constants.ts'

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

test('scores map to the ClinGen-calibrated PP3 and BP4 strengths of Bergquist et al. 2025', () => {
  const points = (score: number) => alphaMissenseEvidence(score).points
  expect([0.99, 0.972, 0.906, 0.792].map(points)).toEqual([4, 3, 2, 1])
  expect([0.7915, 0.564, 0.17].map(points)).toEqual([0, 0, 0])
  expect([0.169, 0.1, 0.099, 0.071, 0.07, 0].map(points)).toEqual([
    -1, -1, -2, -2, -3, -3,
  ])
})
