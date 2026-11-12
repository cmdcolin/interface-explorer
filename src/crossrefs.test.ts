import { expect, test } from 'vitest'

import { complexPairs, participants } from './crossrefs.ts'
import { pairKey } from './interactions.ts'

function row(ac: string, name: string, members: string, expanded = '-') {
  const fields = Array.from({ length: 19 }, () => '-')
  fields[0] = ac
  fields[1] = name
  fields[4] = members
  fields[18] = expanded
  return fields.join('\t')
}

test('participants sum each canonical protein over its chains and isoforms', () => {
  expect(
    participants(
      'P15309-PRO_1(1)|P15309-2(1)|Q00987(2)|CHEBI:15422(0)|CPX-1(1)',
    ),
  ).toEqual(
    new Map([
      ['P15309', 2],
      ['Q00987', 2],
    ]),
  )
})

test('a complex links each predicted pair it holds, and a homodimer only with two copies', () => {
  const content = [
    '#Complex ac\tRecommended name',
    row('CPX-1', 'VHL complex', 'P40337(1)|Q15369(1)|Q15370(1)'),
    row('CPX-2', 'dimer', 'P04637(2)'),
    row('CPX-3', 'monomer in a set', 'P40337(1)|P00001(0)'),
    row('CPX-4', 'nested', 'CPX-1(1)|P99999(1)', 'P40337(1)|P99999(1)'),
  ].join('\n')
  const found = complexPairs(
    content,
    new Set([
      pairKey('P40337', 'Q15369'),
      pairKey('P04637', 'P04637'),
      pairKey('P40337', 'P40337'),
      pairKey('P40337', 'P99999'),
    ]),
  )
  expect(found.get(pairKey('P40337', 'Q15369'))).toEqual([
    { ac: 'CPX-1', name: 'VHL complex' },
  ])
  expect(found.get(pairKey('P04637', 'P04637'))).toEqual([
    { ac: 'CPX-2', name: 'dimer' },
  ])
  expect(found.has(pairKey('P40337', 'P40337'))).toBe(false)
  expect(found.get(pairKey('P40337', 'P99999'))).toEqual([
    { ac: 'CPX-4', name: 'nested' },
  ])
})
