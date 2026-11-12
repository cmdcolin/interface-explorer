import { describe, expect, test } from 'vitest'

import { genomeUrl, jbrowseUrl, sessionUrl, variantSpec } from './links.ts'

describe('links', () => {
  test('a variant opens its complex with the first partner it touches', () => {
    const spec = variantSpec(
      {
        gene: 'VHL',
        partners: [
          { gene: 'ELOB', entity: 'AF-B' },
          { gene: 'ELOC', entity: 'AF-C' },
        ],
      },
      { partners: ['ELOC'], chrom: '3', pos: 1000, allele: 'C>T' },
    )
    expect(spec.views[0]).toMatchObject({
      gene: 'VHL',
      alphaFoldComplexId: 'AF-C',
      variant: 'chr3:1000 C>T',
      connectedView: { loc: 'chr3:970-1030' },
    })
  })

  test('urls open the hosted JBrowse on our config', () => {
    const jbrowse = jbrowseUrl('https://x.io/atlas/jbrowse/config.json')
    expect(jbrowse).toBe(
      'https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fx.io%2Fatlas%2Fjbrowse%2Fconfig.json',
    )
    expect(sessionUrl({ views: [] }, jbrowse)).toBe(
      `${jbrowse}&session=spec-%7B%22views%22%3A%5B%5D%7D`,
    )
    const genome = new URL(genomeUrl('1', 10, 20, jbrowse)).searchParams
    expect(JSON.parse((genome.get('session') ?? '').slice(5))).toMatchObject({
      views: [
        {
          type: 'LinearGenomeView',
          loc: 'chr1:10-20',
          tracks: expect.arrayContaining([
            {
              trackId: 'hg38-clinvarMain',
              displaySnapshot: { type: 'LinearMultiRowFeatureDisplay' },
            },
          ]),
        },
      ],
    })
  })
})
