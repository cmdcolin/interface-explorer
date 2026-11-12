import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { sessionUrl, variantSpec } from './links.ts'
import type { GenePage } from './pages.ts'
import { ROOT, SITE_DATA } from './paths.ts'
import { LIVE, screenshots } from './screenshots.ts'

const jbrowse = `${LIVE}jbrowse/`

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
      url: () => `${LIVE}isoforms/APP/`,
      height: 800,
      wait: 10,
    },
    {
      name: 'are-the-interfaces-real',
      url: () => `${LIVE}gene/PRPH2/?partner=ROM1`,
      height: 800,
      wait: 30,
    },
    {
      name: 'project-9-gpcrs',
      url: () => `${LIVE}gpcr/#GNAS`,
      height: 700,
      wait: 10,
    },
  ],
  { dir: join(ROOT, 'web', 'content', 'blog', 'heroes'), format: 'jpeg' },
  process.argv.slice(2),
)
