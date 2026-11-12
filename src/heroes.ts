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
      name: 'three-places-to-start',
      url: local => `${local}isoforms/APP/`,
      clip: '.map-wrap',
      height: 800,
      wait: 10,
    },
    {
      name: 'are-the-interfaces-real',
      url: local => `${local}gene/PRPH2/?partner=ROM1`,
      clip: '.structure-section',
      height: 1600,
      wait: 30,
    },
    {
      name: 'project-9-gpcrs',
      url: local => `${local}blog/2026-11-12-project-9-gpcrs/`,
      clip: '.complex-view .structure',
      height: 1600,
      wait: 25,
    },
    {
      name: 'sars-cov-2',
      url: local =>
        `${local}blog/2026-11-12-sars-cov-2/#three-worth-a-second-look`,
      height: 700,
      wait: 5,
    },
  ],
  { dir: join(ROOT, 'web', 'content', 'blog', 'heroes'), format: 'jpeg' },
  process.argv.slice(2),
)
