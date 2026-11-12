import mdx from '@astrojs/mdx'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://cmdcolin.github.io',
  base: '/interface-atlas',
  trailingSlash: 'always',
  redirects: { '/gpcr': '/interface-atlas/blog/2026-11-12-project-9-gpcrs/' },
  srcDir: './web',
  publicDir: './site',
  outDir: './dist',
  compressHTML: false,
  build: { inlineStylesheets: 'never' },
  integrations: [mdx()],
})
