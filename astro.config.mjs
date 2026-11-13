import mdx from '@astrojs/mdx'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://cmdcolin.github.io',
  base: '/interface-explorer',
  trailingSlash: 'always',
  srcDir: './web',
  publicDir: './site',
  outDir: './dist',
  compressHTML: false,
  build: { inlineStylesheets: 'never' },
  integrations: [mdx()],
})
