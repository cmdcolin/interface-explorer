import { describe, expect, it } from 'vitest'

import { deletions, igTotals, lostDomains } from './igDomains.ts'

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

describe('igTotals', () => {
  it('counts genes and isoforms that lose a domain', () => {
    const record = (lost: number[]) => ({
      gene: 'X',
      accession: 'P1',
      length: 300,
      domains,
      isoforms: [{ accession: 'P1-2', name: '2', removed: [], lost }],
    })
    expect(igTotals([record([0]), record([])])).toEqual({
      genes: 2,
      genesLosingDomain: 1,
      isoformsLosingDomain: 1,
    })
  })
})
