import { expect, test } from 'vitest'

import { withinDistance } from './contacts.ts'
import type { Point } from './contacts.ts'

test('marks each point with a neighbour closer than the distance', () => {
  const own: Point[] = [
    [0, 0, 0],
    [10, 0, 0],
    [-3, -3, -3],
  ]
  const other: Point[] = [
    [1, 1, 1],
    [-6, -6, -4],
  ]
  expect(withinDistance(own, other, 5)).toEqual([true, false, true])
})

test('a neighbour exactly at the distance does not count, as in scipy', () => {
  expect(
    withinDistance(
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      [[3, 4, 0]],
      5,
    ),
  ).toEqual([false, false])
  expect(withinDistance([[0, 0, 0]], [[3, 3.9999, 0]], 5)).toEqual([true])
})

test('nothing to compare against is never in contact', () => {
  expect(withinDistance([[0, 0, 0]], [], 5)).toEqual([false])
  expect(withinDistance([], [[0, 0, 0]], 5)).toEqual([])
})

test('agrees with a brute-force search', () => {
  let state = 1
  const random = () => {
    state = (state * 48271) % 2147483647
    return (state / 2147483647) * 40 - 20
  }
  const points = (n: number) =>
    Array.from(
      { length: n },
      () => [random(), random(), random()] satisfies Point,
    )
  const own = points(300)
  const other = points(300)
  const brute = own.map(([x, y, z]) =>
    other.some(([a, b, c]) => (x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2 < 16),
  )
  expect(withinDistance(own, other, 4)).toEqual(brute)
  expect(brute.filter(Boolean).length).toBeGreaterThan(50)
})
