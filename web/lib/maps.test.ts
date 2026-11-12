import { expect, test } from 'vitest'

import { lanes } from './maps.ts'

test('overlapping features take the next free lane', () => {
  expect(
    lanes([
      { start: 1, end: 65 },
      { start: 14, end: 53 },
      { start: 100, end: 155 },
      { start: 60, end: 70 },
    ]).map(({ item, lane }) => [item.start, lane]),
  ).toEqual([
    [1, 0],
    [14, 1],
    [60, 1],
    [100, 0],
  ])
})
