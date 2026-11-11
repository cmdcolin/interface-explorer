import { expect, test } from 'vitest'

import { PROBE, SPHERE, SPHERE_POINTS, atomAreas } from './sasa.ts'

test('the probe sphere has unit points spread from pole to pole', () => {
  expect(SPHERE).toHaveLength(SPHERE_POINTS)
  for (const [x, y, z] of SPHERE) {
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
  }
  expect(SPHERE[0]?.[2]).toBeCloseTo(0.99)
  expect(SPHERE.at(-1)?.[2]).toBeCloseTo(-0.99)
})

test('an isolated atom exposes its whole probe-expanded sphere', () => {
  const [carbon, sulfur, unknown] = [
    atomAreas([{ coord: [0, 0, 0], element: 'C' }]),
    atomAreas([{ coord: [0, 0, 0], element: 'S' }]),
    atomAreas([{ coord: [0, 0, 0], element: 'XX' }]),
  ].map(areas => areas[0])
  expect(carbon).toBeCloseTo(4 * Math.PI * (1.7 + PROBE) ** 2, 10)
  expect(sulfur).toBeCloseTo(4 * Math.PI * (1.8 + PROBE) ** 2, 10)
  expect(unknown).toBeCloseTo(4 * Math.PI * (2 + PROBE) ** 2, 10)
})

test('overlapping atoms bury part of each other', () => {
  const alone = 4 * Math.PI * (1.7 + PROBE) ** 2
  const [left = 0, right = 0] = atomAreas([
    { coord: [0, 0, 0], element: 'C' },
    { coord: [1.5, 0, 0], element: 'C' },
  ])
  expect(left).toBeLessThan(alone)
  expect(left).toBeGreaterThan(alone / 2)
  expect(right).toBeLessThan(alone)
})

test('atoms farther apart than their radii do not touch', () => {
  const alone = 4 * Math.PI * (1.7 + PROBE) ** 2
  const areas = atomAreas([
    { coord: [0, 0, 0], element: 'C' },
    { coord: [6.3, 0, 0], element: 'C' },
  ])
  areas.forEach(area => expect(area).toBeCloseTo(alone, 10))
})

test('an atom buried in a shell of others has no exposed area', () => {
  const shell = SPHERE.map(([x, y, z]) => ({
    coord: [x * 2, y * 2, z * 2] satisfies [number, number, number],
    element: 'C',
  }))
  const [buried] = atomAreas([{ coord: [0, 0, 0], element: 'C' }, ...shell])
  expect(buried).toBe(0)
})
