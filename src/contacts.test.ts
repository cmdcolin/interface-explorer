import { expect, test } from 'vitest'

import { nearestDistance, withinDistance } from './contacts.ts'
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

test('the nearest distance agrees with a brute-force search within reach', () => {
  let state = 7
  const random = () => {
    state = (state * 48271) % 2147483647
    return (state / 2147483647) * 40 - 20
  }
  const points = (n: number) =>
    Array.from(
      { length: n },
      () => [random(), random(), random()] satisfies Point,
    )
  const own = points(200)
  const other = points(200)
  const brute = own.map(([x, y, z]) => {
    const best = Math.sqrt(
      Math.min(
        ...other.map(([a, b, c]) => (x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2),
      ),
    )
    return best <= 12 ? best : undefined
  })
  const found = nearestDistance(own, other, 12)
  found.forEach((distance, i) => {
    const expected = brute[i]
    expect(distance === undefined).toBe(expected === undefined)
    if (distance !== undefined && expected !== undefined) {
      expect(distance).toBeCloseTo(expected, 9)
    }
  })
  expect(found.filter(d => d !== undefined).length).toBeGreaterThan(50)
})

test('a point out of reach has no distance', () => {
  expect(nearestDistance([[0, 0, 0]], [[100, 0, 0]], 12)).toEqual([undefined])
  expect(nearestDistance([[0, 0, 0]], [], 12)).toEqual([undefined])
})
