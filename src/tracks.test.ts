import { expect, test } from 'vitest'

import { mergeBlocks } from './coordinates.ts'
import { absolute, bed12, partnerList, withSignificanceRows } from './tracks.ts'

test('consecutive positions join into half-open blocks', () => {
  expect(mergeBlocks([5, 3, 4, 10, 11, 20])).toEqual([
    [3, 6],
    [10, 12],
    [20, 21],
  ])
})

test('reverse strand positions are sorted before merging', () => {
  expect(mergeBlocks([102, 101, 100, 52, 51, 50])).toEqual([
    [50, 53],
    [100, 103],
  ])
})

test('no positions give no blocks', () => {
  expect(mergeBlocks([])).toEqual([])
})

test('block sizes and starts are relative to the feature', () => {
  const line = bed12(
    'chr1',
    '-',
    [
      [100, 103],
      [200, 206],
    ],
    'A–B',
    600,
    '40,110,200',
  )
  expect(line.split('\t')).toEqual([
    'chr1',
    '100',
    '206',
    'A–B',
    '600',
    '-',
    '100',
    '206',
    '40,110,200',
    '2',
    '3,6',
    '0,100',
  ])
})

test('a single block', () => {
  expect(bed12('chrX', '+', [[7, 10]], 'n', 1000, '0,0,0')).toBe(
    'chrX\t7\t10\tn\t1000\t+\t7\t10\t0,0,0\t1\t3\t0',
  )
})

test('relative file names in the hg38 config become absolute URLs', () => {
  expect(
    absolute({
      uri: 'hg38.2bit',
      nested: [{ location: 'ncbiRefSeq/x.bb' }],
      name: 'RefSeq genes',
      url: 'https://example.org/a.bb',
      count: 3,
    }),
  ).toEqual({
    uri: 'https://jbrowse.org/ucsc/hg38/hg38.2bit',
    nested: [{ location: 'https://jbrowse.org/ucsc/hg38/ncbiRefSeq/x.bb' }],
    name: 'RefSeq genes',
    url: 'https://example.org/a.bb',
    count: 3,
  })
})

test('the ClinVar track gains a display with one row per significance', () => {
  const basic = {
    type: 'LinearBasicDisplay',
    encoding: {
      color: {
        field: 'sig',
        scale: { domain: ['PG', 'VUS'], names: ['Pathogenic', 'Uncertain'] },
      },
    },
  }
  expect(
    withSignificanceRows({ trackId: 'hg38-clinvarMain', displays: [basic] }),
  ).toEqual({
    trackId: 'hg38-clinvarMain',
    displays: [
      basic,
      {
        type: 'LinearMultiRowFeatureDisplay',
        marks: [{ mark: 'rect' }],
        rows: {
          field: 'sig',
          sort: ['PG', 'VUS'],
          labels: { PG: 'Pathogenic', VUS: 'Uncertain' },
          colors: { PG: 'rgb(210,0,0)', VUS: 'rgb(0,0,128)' },
        },
        legend: { show: false },
      },
    ],
  })
})

test('a long partner list is cut short with a count of the rest', () => {
  expect(partnerList(['C', 'A', 'B'], 5)).toBe('A, B, C')
  expect(partnerList(['F', 'E', 'D', 'C', 'B', 'A'], 5)).toBe(
    'A, B, C, D, E and 1 more',
  )
})
