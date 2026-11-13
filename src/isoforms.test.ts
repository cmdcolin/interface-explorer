import { describe, expect, it } from 'vitest'

import { bandRuns, isoformTotals, segments } from './isoforms.ts'

describe('segments', () => {
  it('makes an unchanged isoform one segment', () => {
    expect(segments([1, 2, 3, 4])).toEqual([[1, 1, 4]])
  })

  it('splits a deletion into isoform and canonical starts', () => {
    expect(segments([1, 2, 6, 7, 8])).toEqual([
      [1, 1, 2],
      [3, 6, 3],
    ])
  })

  it('leaves replaced residues out', () => {
    expect(segments([1, 2, 3, null, null, null, 6, 7, 8])).toEqual([
      [1, 1, 3],
      [7, 6, 3],
    ])
  })

  it('finds no segment in an entirely new sequence', () => {
    expect(segments([null, null])).toEqual([])
  })
})

describe('bandRuns', () => {
  it('shares a run between consecutive residues in one confidence band', () => {
    expect(bandRuns([95, 90, 89, 70, 69, 50, 49, 0, 91])).toEqual([
      [90, 2],
      [70, 2],
      [50, 2],
      [0, 2],
      [90, 1],
    ])
  })

  it('covers every residue with run lengths', () => {
    const scores = [12, 55, 55, 71, 99, 99, 99]
    expect(bandRuns(scores).reduce((n, [, length]) => n + length, 0)).toBe(
      scores.length,
    )
  })

  it('makes no runs from no scores', () => {
    expect(bandRuns([])).toEqual([])
  })
})

describe('isoformTotals', () => {
  it('counts alternative isoforms and the genes and isoforms that lose something', () => {
    expect(
      isoformTotals([
        {
          modelled: 3,
          interfaceLost: 2,
          pathogenicLost: 4,
          pathogenicAtInterface: 0,
        },
        {
          modelled: 2,
          interfaceLost: 0,
          pathogenicLost: 0,
          pathogenicAtInterface: 3,
        },
      ]),
    ).toEqual({
      genes: 2,
      alternativeIsoforms: 3,
      lackingInterface: 2,
      genesLackingPathogenic: 1,
      genesPathogenicAtInterface: 1,
    })
  })
})
