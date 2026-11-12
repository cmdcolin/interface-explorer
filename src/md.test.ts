import { expect, test } from 'vitest'

import type { Point } from './contacts.ts'
import { burial, helixAxis, mean, parseSwitches, permutationTest, quantileBins } from './md.ts'

test('parseSwitches splits distance pairs from 3Di residues', () => {
  const { pairs, local } = parseSwitches(
    'kind\tresidues\tc1\tc2\tchange\tshare\npair\t59-196\t1.13\t2.81\t1.68\t0.96\n3di\t180\tV\tS\t1.00\t\n',
  )
  expect(pairs).toEqual([{ residues: [59, 196], c1: 1.13, c2: 2.81, change: 1.68, share: 0.96 }])
  expect(local).toEqual([{ residue: 180, c1: 'V', c2: 'S', divergence: 1 }])
})

test('burial counts other residues within the radius', () => {
  const centres = new Map<number, Point>([
    [1, [0, 0, 0]],
    [2, [5, 0, 0]],
    [3, [30, 0, 0]],
  ])
  expect(burial(centres, 10)).toEqual(
    new Map([
      [1, 1],
      [2, 1],
      [3, 0],
    ]),
  )
})

test('quantileBins sorts residues into equal bins by value', () => {
  const value = new Map([1, 2, 3, 4, 5, 6].map(p => [p, 10 - p]))
  expect(quantileBins([1, 2, 3, 4, 5, 6], value, 3)).toEqual([
    [6, 5],
    [4, 3],
    [2, 1],
  ])
})

test('permutationTest draws within bins, so a bin-only signal is not significant', () => {
  const bins = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
  ]
  const high = (set: number[]) => set.filter(p => p > 4).length
  expect(permutationTest(bins, [5, 6], high, 1000).p).toBe(1)
  expect(permutationTest([[1, 2, 3, 4, 5, 6, 7, 8]], [5, 6], high, 1000).p).toBeLessThan(0.3)
})

test('helixAxis follows a straight helix and ignores its direction of travel', () => {
  const helix = (offset: number, up: boolean) =>
    Array.from({ length: 24 }, (_, i) => {
      const angle = (i * 100 * Math.PI) / 180
      const rise = (up ? i : 23 - i) * 1.5
      return [offset + i, [2.3 * Math.cos(angle) + offset * 10, 2.3 * Math.sin(angle), rise] satisfies Point] as const
    })
  const axis = helixAxis(new Map([...helix(0, true), ...helix(100, false)]))
  expect(Math.abs(axis[2])).toBeCloseTo(1, 2)
})

test('mean of nothing is zero', () => {
  expect(mean([])).toBe(0)
  expect(mean([1, 2, 3])).toBe(2)
})
