import { expect, test } from 'vitest'

import { pairCaution } from './pairs.ts'

const synthetase = 'class-II aminoacyl-tRNA synthetase family'

test('a protein only inside mitochondria and one never there are apart', () => {
  expect(
    pairCaution(
      { family: synthetase, locations: ['Cytoplasm, cytosol'] },
      { family: synthetase, locations: ['Mitochondrion matrix'] },
    ),
  ).toEqual({ apart: true, paralogs: true })
})

test('the mitochondrial outer membrane faces the cytosol, so it is not apart', () => {
  expect(
    pairCaution(
      { family: '', locations: ['Cytoplasm'] },
      { family: '', locations: ['Mitochondrion outer membrane'] },
    ),
  ).toEqual({ apart: false, paralogs: false })
})

test('a protein found both inside and outside mitochondria is not apart', () => {
  expect(
    pairCaution(
      { family: 'a family', locations: ['Mitochondrion', 'Cytoplasm'] },
      { family: 'another family', locations: ['Nucleus'] },
    ),
  ).toEqual({ apart: false, paralogs: false })
})

test('missing annotations never flag a pair', () => {
  expect(pairCaution({ family: '', locations: [] }, undefined)).toEqual({
    apart: false,
    paralogs: false,
  })
})
