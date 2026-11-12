import { describe, expect, test } from 'vitest'

import { cifCategory } from './cif.ts'
import {
  SWITCH,
  chainSequence,
  genericNumbers,
  residueMap,
  segmentPath,
  seq1,
  windowIdentity,
  withSources,
} from './gpcr.ts'

function repeat<T>(value: T, times: number) {
  return Array.from({ length: times }, () => value)
}

describe('residueMap', () => {
  test('identical sequences map position to position', () => {
    const { pairs, identity } = residueMap('MKTAYIAKQR', 'MKTAYIAKQR')
    expect(pairs).toEqual(
      new Map(Array.from({ length: 10 }, (_, k) => [k + 1, k + 1])),
    )
    expect(identity).toBe(1)
  })

  test('a fragment keeps the numbering of the full sequence', () => {
    const full = 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ'
    const { pairs, identity } = residueMap(full.slice(10, 25), full)
    expect(pairs).toEqual(
      new Map(Array.from({ length: 15 }, (_, k) => [k + 1, k + 11])),
    )
    expect(identity).toBeCloseTo(15 / full.length)
  })

  test('a substitution is still paired', () => {
    const { pairs, identity } = residueMap('MKTAYIAKQR', 'MKTAWIAKQR')
    expect(pairs.get(5)).toBe(5)
    expect(identity).toBeCloseTo(0.9)
  })
})

describe('entity rows', () => {
  test('a looped category gives one row per entity', () => {
    const cif =
      "loop_\n_entity.id\n_entity.pdbx_description\n1 'Histamine H1 receptor'\n2 miniGsq\n#\n_atom_site.id 1\n#\n"
    expect(cifCategory(cif, 'entity')).toEqual([
      { id: '1', pdbx_description: 'Histamine H1 receptor' },
      { id: '2', pdbx_description: 'miniGsq' },
    ])
  })

  test('a missing category has no rows', () => {
    expect(cifCategory('_entity.id 1\n#\n', 'atom_site')).toEqual([])
  })
})

describe('chainSequence', () => {
  const atoms = [
    { seq: 12, comp: 'GLY' },
    { seq: 10, comp: 'MET' },
    { seq: 10, comp: 'MET' },
    { seq: 11, comp: 'MSE' },
  ]

  test('one letter per residue in sequence order', () => {
    expect(chainSequence(atoms)).toEqual({
      numbers: [10, 11, 12],
      sequence: 'MXG',
    })
  })

  test('sources are set per residue and cleared elsewhere', () => {
    const mapped = withSources(
      atoms,
      new Map([[10, { accession: 'P1', number: 1 }]]),
    )
    expect(mapped.map(a => a.source)).toEqual([
      undefined,
      { accession: 'P1', number: 1 },
      { accession: 'P1', number: 1 },
      undefined,
    ])
  })
})

describe('seq1', () => {
  test('standard and extended residue codes, anything else unknown', () => {
    expect(['ALA', 'trp', 'SEC', 'PYL', 'MSE', 'HOH'].map(seq1)).toEqual([
      'A',
      'W',
      'U',
      'O',
      'X',
      'X',
    ])
  })

  test('codes shorter than three letters have no letter', () => {
    expect(seq1('DA')).toBe('')
  })
})

describe('segmentPath', () => {
  test('follows the better matching sequence on each side of a junction', () => {
    const scaffold = [...repeat(1, 20), ...repeat(0, 12)]
    const tail = [...repeat(0, 20), ...repeat(1, 12)]
    expect(segmentPath([scaffold, tail])).toEqual([
      ...repeat(0, 20),
      ...repeat(1, 12),
    ])
  })

  test('a short better stretch does not pay for two switches', () => {
    const scaffold = [...repeat(1, 10), ...repeat(0, SWITCH), ...repeat(1, 10)]
    const other = [...repeat(0, 10), ...repeat(1, SWITCH), ...repeat(0, 10)]
    expect(segmentPath([scaffold, other])).toEqual(repeat(0, scaffold.length))
  })

  test('ties go to the first sequence', () => {
    expect(
      segmentPath([
        [1, 1, 1],
        [1, 1, 1],
      ]),
    ).toEqual([0, 0, 0])
  })
})

test('window identity is the share of matches around a residue', () => {
  const matches = [...repeat(true, 6), ...repeat(false, 6)]
  expect(windowIdentity(matches, 0)).toBe(1)
  expect(windowIdentity(matches, 5)).toBeCloseTo(6 / 11)
  expect(windowIdentity(matches, 11)).toBe(0)
})

describe('genericNumbers', () => {
  const row = (
    sequence_number: number,
    amino_acid: string,
    protein_segment: string,
    display_generic_number: string | null,
  ) => ({
    sequence_number,
    amino_acid,
    protein_segment,
    display_generic_number,
  })

  test('takes the generic number, or the segment where there is none', () => {
    expect(
      genericNumbers(
        [
          row(1, 'D', 'TM3', '3.49x49'),
          row(2, 'R', 'TM3', '3.50x50'),
          row(3, 'Y', 'ICL2', null),
        ],
        'DRY',
      ),
    ).toEqual(
      new Map([
        [1, '3.49x49'],
        [2, '3.50x50'],
        [3, 'ICL2'],
      ]),
    )
  })

  test('skips residues that differ from the sequence', () => {
    expect(genericNumbers([row(2, 'K', 'TM3', '3.50x50')], 'DRY')).toEqual(
      new Map(),
    )
  })
})
