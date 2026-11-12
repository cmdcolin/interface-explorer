import { expect, test } from 'vitest'

import type { Atom } from './pdbe.ts'
import {
  chainOf,
  matureName,
  matureProteins,
  separateChains,
  touching,
  trustworthy,
} from './viral.ts'

const POLYPROTEIN = {
  sequence: { value: 'M'.repeat(100) },
  features: [
    {
      type: 'Chain',
      description: 'Replicase polyprotein',
      location: part(1, 100),
    },
    { type: 'Chain', description: 'nsp1', location: part(1, 40) },
    { type: 'Chain', description: 'nsp2', location: part(41, 100) },
    { type: 'Site', description: 'Cleavage', location: part(40, 41) },
  ],
}

function part(begin: number, end: number) {
  return { start: { value: begin }, end: { value: end } }
}

function atom(
  accession: string,
  number: number,
  letter: string,
  x: number,
  entity = accession,
) {
  return {
    chain: entity,
    entity,
    seq: number,
    auth: number,
    comp: 'ALA',
    source: { accession, number },
    sourceLetter: letter,
    xyz: [x, 0, 0],
  } satisfies Atom
}

test('the mature proteins are the parts, not the whole polyprotein', () => {
  expect(matureProteins(POLYPROTEIN)).toEqual([
    { name: 'nsp1', begin: 1, end: 40 },
    { name: 'nsp2', begin: 41, end: 100 },
  ])
})

test('a protein cut into no parts keeps its own chain', () => {
  expect(
    matureProteins({
      sequence: { value: 'M'.repeat(60) },
      features: [{ type: 'Chain', description: 'ORF6', location: part(1, 60) }],
    }),
  ).toEqual([{ name: 'ORF6', begin: 1, end: 60 }])
})

test('residues are named by the shortest mature protein holding them', () => {
  const spike = [
    { name: 'Spike glycoprotein', begin: 14, end: 1273 },
    { name: 'Spike protein S1', begin: 14, end: 685 },
    { name: 'Spike protein S2', begin: 686, end: 1273 },
  ]
  expect(matureName(spike, [500])).toBe('Spike protein S1')
  expect(matureName(spike, [500, 700])).toBe(
    'Spike protein S1, Spike protein S2',
  )
  expect(matureName(matureProteins(POLYPROTEIN), [55, 60])).toBe('nsp2')
  expect(matureName(spike, [5])).toBe('')
})

test('a chain is every atom of one protein, isoforms included', () => {
  const rows = [atom('P1-2', 5, 'A', 0), atom('P2', 5, 'A', 9)]
  expect(chainOf(rows, 'P1')).toEqual([rows[0]])
})

test('a chain numbered unlike its UniProt sequence is left out', () => {
  const chain = [atom('P1', 1, 'A', 0), atom('P1', 2, 'A', 1)]
  expect(trustworthy(chain, 'AA')).toEqual(chain)
  expect(trustworthy(chain, 'AC')).toEqual([])
})

test('a fusion of the two proteins in one entity is not a complex', () => {
  const separate = [atom('P1', 1, 'A', 0), atom('P2', 1, 'A', 3)]
  expect(separateChains(separate, 'P1', 'P2')).toEqual({
    own: [separate[0]],
    other: [separate[1]],
    fused: false,
  })
  const chimera = [
    atom('P1', 1, 'A', 0, 'fused'),
    atom('P2', 1, 'A', 3, 'fused'),
  ]
  expect(separateChains(chimera, 'P1', 'P2')).toEqual({
    own: [],
    other: [],
    fused: true,
  })
})

test('touching residues are within the contact distance', () => {
  const own = [
    atom('P1', 1, 'A', 0),
    atom('P1', 2, 'A', 4),
    atom('P1', 2, 'A', 20),
  ]
  const other = [atom('P2', 9, 'A', 7)]
  expect(touching(own, other)).toEqual([2])
  expect(touching(own, [])).toEqual([])
})
