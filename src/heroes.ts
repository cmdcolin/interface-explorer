import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  INTERFACE_TRACKS,
  geneLocus,
  locusUrl,
  pdbSpec,
  sessionUrl,
  variantSpec,
} from './links.ts'
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

const actb = gene('ACTB')
const kras = gene('KRAS')

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
      url: () => firstPathogenic('GNAO1', 'GNB1'),
      height: 800,
      wait: 45,
    },
    {
      name: 'predictions-match-experiment',
      url: () =>
        sessionUrl(
          pdbSpec('KRAS', '6EPL', geneLocus(kras), INTERFACE_TRACKS),
          jbrowse,
        ),
      height: 800,
      wait: 45,
    },
    {
      name: 'interfaces-are-conserved',
      url: () =>
        locusUrl(
          geneLocus(actb),
          [...INTERFACE_TRACKS.slice(0, 3), 'hg38-phyloP100way'],
          jbrowse,
        ),
      height: 740,
      wait: 20,
    },
    {
      name: 'project-9-gpcrs',
      url: () =>
        sessionUrl(pdbSpec('HTR1A', '9HYI', 'chr5:63960454-63961719'), jbrowse),
      height: 800,
      wait: 45,
    },
  ],
  { dir: join(ROOT, 'web', 'content', 'blog', 'heroes'), format: 'jpeg' },
  process.argv.slice(2),
)
