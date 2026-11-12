import { describe, expect, it } from 'vitest'

import type { AtlasProtein } from './atlasData.ts'
import { consequenceIndex, proteinTable, residueCounts } from './gnomad.ts'

function site(
  ref: string,
  alt: string,
  filter: string,
  alleleCount: string,
  consequence: string,
) {
  return [
    'key',
    '0',
    '.',
    '1',
    '2',
    '95,95,95',
    ref,
    alt,
    filter,
    alleleCount,
    '100',
    '0',
    '0',
    '0',
    '',
    'GENE',
    consequence,
  ].join('\t')
}

describe('consequenceIndex', () => {
  it('numbers missense and synonymous SNVs that passed and were seen', () => {
    expect(consequenceIndex(site('C', 'T', 'PASS', '3', 'missense'))).toBe(0)
    expect(consequenceIndex(site('C', 'T', 'PASS', '3', 'synonymous'))).toBe(1)
  })

  it('ignores indels, filtered and unseen alleles and other consequences', () => {
    expect(
      consequenceIndex(site('C', 'CA', 'PASS', '3', 'missense')),
    ).toBeUndefined()
    expect(
      consequenceIndex(site('C', 'T', 'AC0', '0', 'missense')),
    ).toBeUndefined()
    expect(
      consequenceIndex(site('C', 'T', 'PASS', '0', 'missense')),
    ).toBeUndefined()
    expect(
      consequenceIndex(site('C', 'T', 'PASS', '3', 'pLoF')),
    ).toBeUndefined()
  })
})

describe('residueCounts', () => {
  it('adds the variants at each base of a codon', () => {
    const observed = new Map([
      [10, [0]],
      [11, [0, 1]],
      [20, [1]],
    ])
    expect(
      residueCounts(
        [
          [10, 11, 12],
          [20, 21, 22],
          [30, 31, 32],
        ],
        observed,
      ),
    ).toEqual([
      [2, 1],
      [0, 1],
      [0, 0],
    ])
  })
})

describe('proteinTable', () => {
  const protein: AtlasProtein = {
    accession: 'P00000',
    gene: 'GENE',
    length: 4,
    complexes: 1,
    hetero: 1,
    interfaces: [
      {
        entity: 'AF-0',
        partner: null,
        partner_gene: null,
        modelled_as: null,
        iptm: null,
        ipsae: 0.8,
        pdockq: null,
        residues: { 1: 90, 2: 90 },
      },
    ],
    context: { 1: [90, 0.5], 2: [90, 0.5], 3: [90, 0.5], 4: [90, 0.1] },
  }
  const counts: [number, number][] = [
    [1, 4],
    [1, 4],
    [5, 4],
    [9, 9],
  ]

  it('compares the interface with the other folded surface', () => {
    expect(proteinTable(protein, counts, () => true)).toEqual([[2, 8, 5, 4]])
  })

  it('leaves out a protein with no variants at all', () => {
    expect(
      proteinTable(
        protein,
        [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        () => true,
      ),
    ).toEqual([])
  })

  it('leaves out a protein with no complex in the band', () => {
    expect(proteinTable(protein, counts, ipsae => ipsae >= 0.9)).toEqual([])
  })
})
