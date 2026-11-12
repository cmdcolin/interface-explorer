import { expect, test } from 'vitest'

import { contactChains } from './pdbe.ts'
import type { Atom } from './pdbe.ts'

function atom(chain: string, x: number) {
  return {
    chain,
    entity: chain,
    seq: 1,
    auth: 1,
    comp: 'ALA',
    source: { accession: 'P1', number: 1 },
    sourceLetter: 'A',
    xyz: [x, 0, 0],
  } satisfies Atom
}

test('the chain pair is the one that touches, not the busiest of each side', () => {
  const own = [atom('E', 0), atom('E', 1), atom('F', 40)]
  const other = [atom('B', 3), atom('B', 4), atom('C', 42)]
  expect(contactChains(own, other)).toEqual({ own: 'E', other: 'B' })
  expect(contactChains([own[2]!], other)).toEqual({ own: 'F', other: 'C' })
})

test('a copy that touches nothing is not the reported chain', () => {
  const own = [atom('A', 100), atom('B', 0)]
  expect(contactChains(own, [atom('Z', 2)])).toEqual({ own: 'B', other: 'Z' })
})

test('nothing in contact reports no chains', () => {
  expect(contactChains([atom('A', 0)], [atom('B', 99)])).toEqual({
    own: '',
    other: '',
  })
  expect(contactChains([], [])).toEqual({ own: '', other: '' })
})
