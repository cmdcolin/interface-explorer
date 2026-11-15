import { describe, expect, it } from 'vitest'

import {
  deletions,
  igTotals,
  lostDomains,
  signalPeptide,
  truncatesSignal,
} from './igDomains.ts'

const domains = [
  { start: 19, end: 135, name: 'Ig-like V-type' },
  { start: 145, end: 228, name: 'Ig-like C2-type' },
]

describe('deletions', () => {
  it('keeps edits with no replacement and drops substitutions', () => {
    expect(
      deletions([
        [13, 139, ''],
        [309, 364, 'VR'],
      ]),
    ).toEqual([[13, 139]])
  })
})

describe('lostDomains', () => {
  it('names a domain that the deletion covers', () => {
    expect(lostDomains(domains, [[13, 139]])).toEqual([0])
  })

  it('leaves a partly deleted domain', () => {
    expect(lostDomains(domains, [[100, 200]])).toEqual([])
  })

  it('names every covered domain', () => {
    expect(lostDomains(domains, [[10, 240]])).toEqual([0, 1])
  })
})

describe('signalPeptide', () => {
  it('reads the span of the signal feature', () => {
    expect(
      signalPeptide({
        features: [
          {
            type: 'Domain',
            location: { start: { value: 19 }, end: { value: 135 } },
          },
          {
            type: 'Signal',
            location: { start: { value: 1 }, end: { value: 19 } },
          },
        ],
      }),
    ).toEqual({ start: 1, end: 19 })
  })

  it('is undefined when the entry has none', () => {
    expect(signalPeptide({ features: [] })).toBeUndefined()
  })
})

describe('truncatesSignal', () => {
  const signal = { start: 1, end: 19 }

  it('flags a deletion that overlaps the signal peptide', () => {
    expect(truncatesSignal(signal, [[4, 175]])).toBe(true)
  })

  it('leaves a deletion that starts after it', () => {
    expect(truncatesSignal(signal, [[241, 417]])).toBe(false)
  })

  it('is false without a signal annotation', () => {
    expect(truncatesSignal(undefined, [[1, 100]])).toBe(false)
  })
})

describe('igTotals', () => {
  it('counts genes and isoforms that lose a domain', () => {
    const record = (lost: number[], signalTruncated = false) => ({
      gene: 'X',
      accession: 'P1',
      length: 300,
      signal: { start: 1, end: 19 },
      domains,
      isoforms: [
        { accession: 'P1-2', name: '2', removed: [], lost, signalTruncated },
      ],
    })
    expect(igTotals([record([0]), record([])])).toEqual({
      genes: 2,
      genesLosingDomain: 1,
      isoformsLosingDomain: 1,
      isoformsTruncatingSignal: 0,
      genesTruncatingSignal: 0,
    })
  })

  it('counts the isoforms whose deletion also removes the signal peptide', () => {
    const record = (lost: number[], signalTruncated: boolean) => ({
      gene: 'X',
      accession: 'P1',
      length: 300,
      signal: { start: 1, end: 19 },
      domains,
      isoforms: [
        { accession: 'P1-2', name: '2', removed: [], lost, signalTruncated },
      ],
    })
    expect(igTotals([record([0], true), record([0], false)])).toEqual({
      genes: 2,
      genesLosingDomain: 2,
      isoformsLosingDomain: 2,
      isoformsTruncatingSignal: 1,
      genesTruncatingSignal: 1,
    })
  })
})
