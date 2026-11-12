import { join } from 'node:path'

import { screenshots } from '../src/screenshots.ts'

await screenshots(
  [
    { name: 'home', url: local => local, height: 1000, wait: 2 },
    {
      name: 'gene_GNAO1',
      url: local => `${local}gene/GNAO1/`,
      height: 1000,
      wait: 2,
    },
    {
      name: 'isoforms_APP',
      url: local => `${local}isoforms/APP/`,
      height: 1000,
      wait: 2,
    },
    { name: 'gpcr', url: local => `${local}blog/2026-11-12-project-9-gpcrs/`, height: 1000, wait: 2 },
    {
      name: 'variant3d',
      url: local => `${local}gene/VHL/`,
      follow: '#variants tr:has(.chip.pathogenic) td:last-child a',
      height: 800,
      wait: 45,
    },
  ],
  { dir: join(import.meta.dirname, 'shots'), format: 'png' },
  process.argv.slice(2),
)
