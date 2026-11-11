import { expect, test } from 'vitest'

import {
  nanPercentile,
  numpyRound,
  pairwiseSum,
  pythonRound,
  seededRandom,
} from './numeric.ts'

test('pythonRound rounds the exact binary value, ties to even', () => {
  expect(pythonRound(2.675, 2)).toBe(2.67)
  expect(pythonRound(87.25, 1)).toBe(87.2)
  expect(pythonRound(87.35, 1)).toBe(87.3)
  expect(pythonRound(0.0625, 3)).toBe(0.062)
  expect(pythonRound(0.125, 2)).toBe(0.12)
  expect(pythonRound(0.375, 2)).toBe(0.38)
  expect(pythonRound(2.5)).toBe(2)
  expect(pythonRound(-1.005, 2)).toBe(-1)
  expect(pythonRound(Infinity, 2)).toBe(Infinity)
  expect(pythonRound(NaN, 2)).toBeNaN()
})

test('numpyRound scales, rounds half to even and scales back', () => {
  expect(numpyRound(2.675, 2)).toBe(2.68)
  expect(numpyRound(0.0625, 3)).toBe(0.062)
  expect(numpyRound(0.1235, 3)).toBe(0.124)
  expect(numpyRound(1.5)).toBe(2)
  expect(numpyRound(2.5)).toBe(2)
})

test('pairwiseSum adds in numpy order, which can differ from a running sum', () => {
  const values = Array.from({ length: 8 }, (_, i) => 1 / (i + 3))
  expect(pairwiseSum(values)).toBe(1.4289682539682538)
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(1.428968253968254)
  expect(pairwiseSum([])).toBe(0)
  expect(pairwiseSum([1, 2, 3])).toBe(6)
})

test('nanPercentile interpolates linearly and skips NaN', () => {
  expect(nanPercentile([4, NaN, 1, 2, 3], 50)).toBe(2.5)
  expect(nanPercentile([1, 2, 3, 4, 5], 2.5)).toBeCloseTo(1.1)
  expect(nanPercentile([1, 2, Infinity], 2.5)).toBe(1.05)
  expect(nanPercentile([1, 2, Infinity], 97.5)).toBeNaN()
  expect(nanPercentile([NaN], 50)).toBeNaN()
})

test('seededRandom repeats for a seed and stays in [0, 1)', () => {
  const first = seededRandom(0)
  const second = seededRandom(0)
  const draws = Array.from({ length: 1000 }, () => first())
  expect(draws).toEqual(Array.from({ length: 1000 }, () => second()))
  expect(draws.every(value => value >= 0 && value < 1)).toBe(true)
  expect(seededRandom(1)()).not.toBe(draws[0])
})
