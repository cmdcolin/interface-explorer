import { describe, expect, it } from 'vitest'

import { applyEdits, replacedPositions, sharedEnds } from './sequences.ts'

describe('sharedEnds', () => {
  it('counts matching prefix and suffix', () => {
    expect(sharedEnds('ABCDE', 'ABXDE')).toEqual([2, 2])
  })

  it('treats identical sequences as all prefix', () => {
    expect(sharedEnds('ABC', 'ABC')).toEqual([3, 0])
  })

  it('does not overlap the suffix with the prefix', () => {
    expect(sharedEnds('AAA', 'AA')).toEqual([2, 0])
  })

  it('finds nothing shared', () => {
    expect(sharedEnds('ABC', 'XYZW')).toEqual([0, 0])
  })
})

describe('replacedPositions', () => {
  it('keeps no positions for a deletion', () => {
    expect(replacedPositions('MABCDEF', 3, 5, '')).toEqual([])
  })

  it('keeps unchanged residues of a same-length replacement', () => {
    expect(replacedPositions('MABCDEF', 3, 5, 'BXD')).toEqual([3, null, 5])
  })

  it('keeps shared ends of a different-length replacement', () => {
    expect(replacedPositions('MABCDEFG', 3, 6, 'BXYZE')).toEqual([
      3,
      null,
      null,
      null,
      6,
    ])
  })
})

describe('applyEdits', () => {
  it('returns the canonical sequence without edits', () => {
    expect(applyEdits('MAB', [])).toEqual({
      sequence: 'MAB',
      positions: [1, 2, 3],
    })
  })

  it('applies a deletion', () => {
    expect(applyEdits('MABCDEFG', [[3, 5, '']])).toEqual({
      sequence: 'MAEFG',
      positions: [1, 2, 6, 7, 8],
    })
  })

  it('applies a same-length replacement', () => {
    expect(applyEdits('MABCDEFG', [[3, 5, 'BXD']])).toEqual({
      sequence: 'MABXDEFG',
      positions: [1, 2, 3, null, 5, 6, 7, 8],
    })
  })

  it('applies a different-length replacement with shared ends', () => {
    expect(applyEdits('MABCDEFG', [[3, 6, 'BXYZE']])).toEqual({
      sequence: 'MABXYZEFG',
      positions: [1, 2, 3, null, null, null, 6, 7, 8],
    })
  })

  it('keeps canonical coordinates across several edits', () => {
    expect(
      applyEdits('MABCDEFG', [
        [2, 2, 'Q'],
        [6, 8, ''],
      ]),
    ).toEqual({ sequence: 'MQBCD', positions: [1, null, 3, 4, 5] })
  })
})
