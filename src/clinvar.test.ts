import { describe, expect, it } from 'vitest'

import {
  AMINO_ACIDS,
  conditions,
  MISSENSE,
  onSequence,
  toCanonical,
} from './clinvar.ts'

describe('conditions', () => {
  it('keeps each named condition once', () => {
    expect(
      conditions(
        'Von Hippel-Lindau syndrome|not provided|Hereditary cancer-predisposing syndrome;Von Hippel-Lindau syndrome',
      ),
    ).toEqual([
      'Von Hippel-Lindau syndrome',
      'Hereditary cancer-predisposing syndrome',
    ])
  })

  it('drops placeholders', () => {
    expect(conditions('not provided|not specified|See cases')).toEqual([])
  })
})

describe('MISSENSE', () => {
  it('parses transcript and protein change', () => {
    expect(
      MISSENSE.exec('NM_000516.7(GNAS):c.1024C>T (p.Arg342Trp)')?.slice(1),
    ).toEqual(['NM_000516', 'Arg', '342', 'Trp'])
  })

  it('rejects synonymous and frameshift', () => {
    expect(MISSENSE.exec('NM_000516.7(GNAS):c.1026G>A (p.Arg342=)')).toBeNull()
    expect(MISSENSE.exec('NM_000516.7(GNAS):c.1024del (p.Arg342fs)')).toBeNull()
  })

  it('leaves nonsense to the amino acid filter', () => {
    const match = MISSENSE.exec('NM_000516.7(GNAS):c.1024C>T (p.Arg342Ter)')
    expect(AMINO_ACIDS.has(match?.[4] ?? '')).toBe(false)
  })
})

describe('onSequence', () => {
  it('matches the wild type', () => {
    expect(onSequence({ position: 3, change: 'C3Y' }, 'MAC')).toBe(true)
  })

  it('rejects the wrong wild type', () => {
    expect(onSequence({ position: 3, change: 'D3Y' }, 'MAC')).toBe(false)
  })

  it('rejects a position beyond the sequence', () => {
    expect(onSequence({ position: 4, change: 'C4Y' }, 'MAC')).toBe(false)
  })
})

describe('toCanonical', () => {
  const isoform = {
    sequence: 'MABXYZEFG',
    positions: [1, 2, 3, null, null, null, 6, 7, 8],
  }

  it('maps an isoform position to the canonical one', () => {
    expect(
      toCanonical({ position: 8, change: 'F8L', label: 'pathogenic' }, isoform),
    ).toEqual({ position: 7, change: 'F7L', label: 'pathogenic' })
  })

  it('drops a residue absent from the canonical sequence', () => {
    expect(toCanonical({ position: 4, change: 'X4L' }, isoform)).toBeUndefined()
  })

  it('drops the wrong wild type', () => {
    expect(toCanonical({ position: 8, change: 'A8L' }, isoform)).toBeUndefined()
  })

  it('drops a position beyond the isoform', () => {
    expect(
      toCanonical({ position: 10, change: 'G10L' }, isoform),
    ).toBeUndefined()
  })
})
