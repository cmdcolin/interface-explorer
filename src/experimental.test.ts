import { expect, test } from 'vitest'

import {
  chooseEntry,
  depositionDates,
  interfaceAgreement,
  parseSifts,
  sharedEntries,
  summarise,
} from './experimental.ts'
import type { Atom } from './pdbe.ts'

const SIFTS = [
  '# 2026/11/01 - 00:00',
  'PDB\tCHAIN\tSP_PRIMARY\tRES_BEG\tRES_END\tPDB_BEG\tPDB_END\tSP_BEG\tSP_END',
  '1abc\tA\tP1\t1\t50\t1\t50\t11\t60',
  '1abc\tA\tP1\t51\t70\t51\t70\t101\t120',
  '1abc\tB\tP1\t1\t30\t1\t30\t11\t40',
  '1abc\tC\tP2\t1\t90\t1\t90\t1\t90',
  '2xyz\tA\tP1\t1\t100\t1\t100\t1\t100',
].join('\n')

test('SIFTS coverage is the best chain of each protein in each entry', () => {
  const { coverage, chains } = parseSifts(SIFTS)
  expect(coverage.get('P1')).toEqual(
    new Map([
      ['1abc', 70],
      ['2xyz', 100],
    ]),
  )
  expect(coverage.get('P2')).toEqual(new Map([['1abc', 90]]))
  expect(chains).toEqual(
    new Map([
      ['1abc', 3],
      ['2xyz', 1],
    ]),
  )
})

test('shared entries hold both proteins', () => {
  const { coverage } = parseSifts(SIFTS)
  expect(sharedEntries(coverage.get('P1'), coverage.get('P2'))).toEqual([
    { pdb: '1abc', covered: 160 },
  ])
  expect(sharedEntries(coverage.get('P1'), coverage.get('P3'))).toEqual([])
})

test('the chosen entry covers nearly the most with the fewest chains', () => {
  const shared = [
    { pdb: '1big', covered: 200 },
    { pdb: '2few', covered: 190 },
    { pdb: '3low', covered: 100 },
  ]
  const chains = new Map([
    ['1big', 12],
    ['2few', 2],
    ['3low', 2],
  ])
  expect(chooseEntry(shared, chains)).toBe('2few')
  expect(chooseEntry(shared, new Map([...chains, ['2few', 61]]))).toBe('1big')
  expect(chooseEntry([], chains)).toBeUndefined()
})

test('deposition dates come from the wwPDB entry index', () => {
  const index = [
    'IDCODE, HEADER, ACCESSION DATE, COMPOUND',
    '------- ------- ---------------',
    '100D\tDNA-RNA HYBRID\t12/05/94\tA TITLE',
    '8ABC\tSIGNALING PROTEIN\t03/07/22\tANOTHER',
  ].join('\n')
  expect(depositionDates(index)).toEqual(
    new Map([
      ['100d', '1994-12-05'],
      ['8abc', '2022-03-07'],
    ]),
  )
})

function atom(accession: string, number: number, x: number): Atom {
  return {
    chain: accession,
    entity: accession,
    seq: number,
    comp: 'ALA',
    source: { accession, number },
    sourceLetter: 'A',
    xyz: [x, 0, 0],
  }
}

test('agreement counts predicted residues the structure resolves', () => {
  const rows = [
    atom('P1', 10, 0),
    atom('P1', 11, 3),
    atom('P1', 12, 20),
    atom('P2', 5, 6),
  ]
  const own = { accession: 'P1', sequence: 'A'.repeat(20) }
  expect(interfaceAgreement(rows, own, 'P2', [11, 12, 99])).toEqual({
    experimental: 1,
    predicted: 2,
    shared: 1,
  })
})

test('agreement accepts isoform chains numbered as the canonical protein', () => {
  const rows = [atom('P1-2', 11, 3), atom('P1-2', 12, 20), atom('P2-3', 5, 6)]
  const own = { accession: 'P1', sequence: 'A'.repeat(20) }
  expect(interfaceAgreement(rows, own, 'P2', [11, 12])).toEqual({
    experimental: 1,
    predicted: 2,
    shared: 1,
  })
})

test('agreement leaves out an isoform numbered differently', () => {
  const rows = [atom('P1-2', 11, 3), atom('P1-2', 12, 4), atom('P2', 5, 6)]
  const own = { accession: 'P1', sequence: `${'A'.repeat(11)}G` }
  expect(interfaceAgreement(rows, own, 'P2', [11, 12])).toBeUndefined()
})

test('agreement needs both proteins in the structure', () => {
  const own = { accession: 'P1', sequence: 'A'.repeat(20) }
  expect(
    interfaceAgreement([atom('P1', 11, 3)], own, 'P2', [11]),
  ).toBeUndefined()
})

test('the summary takes medians over pairs that touch', () => {
  expect(
    summarise([
      { experimental: 10, predicted: 10, shared: 8 },
      { experimental: 10, predicted: 5, shared: 2 },
      { experimental: 0, predicted: 4, shared: 0 },
    ]),
  ).toEqual({
    pairs: 3,
    touching: 2,
    recall: 0.5,
    precision: 0.6,
    recovered: 1,
    histogram: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  })
})
