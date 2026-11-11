import { expect, test } from 'vitest'

import { runs } from './pages.ts'

test('consecutive residues collapse into runs', () => {
  expect(runs([5, 1, 2, 3, 7, 8, 10])).toBe('1–3, 5, 7–8, 10')
})

test('repeated residues', () => {
  expect(runs([1, 1, 2])).toBe('1–2')
})

test('no residues', () => {
  expect(runs([])).toBe('')
})
