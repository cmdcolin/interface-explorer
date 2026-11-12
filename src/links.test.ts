import { describe, expect, test } from 'vitest'

import { genomeUrl, sessionUrl, variantSpec } from './links.ts'

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

  test('urls carry the session spec and the JBrowse prefix', () => {
    expect(sessionUrl({ views: [] }, '/atlas/jbrowse/')).toBe(
      '/atlas/jbrowse/?session=spec-%7B%22views%22%3A%5B%5D%7D',
    )
    expect(genomeUrl('1', 10, 20)).toMatch(
      /^jbrowse\/\?assembly=hg38&loc=chr1:10-20&tracks=/,
    )
  })
})
