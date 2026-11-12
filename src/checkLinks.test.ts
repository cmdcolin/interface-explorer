import { describe, expect, test } from 'vitest'

import { internalTargets, targetFile } from './checkLinks.ts'

describe('checkLinks', () => {
  test('resolves relative and absolute links against the page, skipping external ones', () => {
    const html = `
      <a href="../../gpcr/#HTR1A">a</a>
      <a href="/interface-explorer/jbrowse/?session=spec-x&amp;y=1">b</a>
      <img src="/interface-explorer/logo.svg" />
      <a href="https://www.uniprot.org/">c</a>
      <a href="#top">d</a>`
    expect(
      internalTargets(html, 'blog/post/index.html').map(t => t.path),
    ).toEqual([
      '/interface-explorer/gpcr/',
      '/interface-explorer/jbrowse/',
      '/interface-explorer/logo.svg',
    ])
  })

  test('maps a path to its file in the build, or to nothing outside the base', () => {
    expect(targetFile('dist', '/interface-explorer/gene/VHL/')).toBe(
      'dist/gene/VHL/index.html',
    )
    expect(targetFile('dist', '/interface-explorer/logo.svg')).toBe(
      'dist/logo.svg',
    )
    expect(targetFile('dist', '/elsewhere/')).toBeUndefined()
  })
})
