import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { jbrowseUrl, sessionUrl, variantSpec } from './links.ts'
import type { GenePage } from './pages.ts'
import { ROOT, SITE_DATA } from './paths.ts'
import { LIVE, screenshots } from './screenshots.ts'

const jbrowse = jbrowseUrl(`${LIVE}jbrowse/config.json`)

function gene(name: string): GenePage {
  return JSON.parse(
    readFileSync(join(SITE_DATA, 'genes', `${name}.json`), 'utf8'),
  )
}

function firstPathogenic(name: string, partner: string) {
  const record = gene(name)
  const variant = record.variants.find(
    v => v.label === 'pathogenic' && v.partners.includes(partner),
  )
  return variant ? sessionUrl(variantSpec(record, variant), jbrowse) : jbrowse
}

await screenshots(
  [
    {
      name: 'disease-variants-cluster',
      url: () => firstPathogenic('VHL', 'ELOC'),
      height: 800,
      wait: 45,
    },
    {
      name: 'are-the-interfaces-real',
      url: local => `${local}figures/interfaces-real/`,
      clip: '.hero-figure',
      height: 1000,
      wait: 2,
    },
    {
      name: 'project-9-gpcrs',
      url: local => `${local}figures/gpcrs/`,
      clip: '.hero-figure',
      height: 1000,
      wait: 35,
    },
    {
      name: 'the-partner-is-itself',
      url: local => `${local}gene/SOD1/?partner=SOD1`,
      clip: '#structure',
      height: 1600,
      wait: 30,
    },
    {
      name: 'slc35a2-switch',
      url: local => `${local}switch/`,
      clip: '.complex-view .structure',
      height: 1600,
      wait: 25,
    },
    {
      name: 'browse-by-disease',
      url: local => `${local}figures/diseases/`,
      clip: '.hero-figure',
      height: 1000,
      wait: 2,
    },
    {
      name: 'sars-cov-2',
      url: local => `${local}figures/sars-cov-2/`,
      clip: '.hero-figure',
      height: 1000,
      wait: 2,
    },
  ],
  { dir: join(ROOT, 'web', 'content', 'blog', 'heroes'), format: 'jpeg' },
  process.argv.slice(2),
)

await screenshots(
  [
    { name: 'isg15-plpro', path: 'viral/7rbs/' },
    { name: 'nemo-nsp5', path: 'viral/7t2u/' },
    { name: 'ywhaz-n', path: 'viral/7zit/' },
    {
      name: 'ttr-itself',
      path: 'gene/TTR/?partner=TTR',
      clip: '#structure',
    },
  ].map(({ name, path, clip }) => ({
    name,
    url: (local: string) => `${local}${path}`,
    clip: clip ?? '.complex-view .structure',
    height: 1600,
    wait: 25,
  })),
  { dir: join(ROOT, 'web', 'content', 'blog', 'figures'), format: 'jpeg' },
  process.argv.slice(2),
)
