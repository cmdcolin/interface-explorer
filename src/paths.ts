import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '..')
export const DATA = join(ROOT, 'data')
export const OUT = process.env.OUT_DIR ?? join(ROOT, 'out')
export const SITE = process.env.SITE_DIR ?? join(ROOT, 'site')
export const SITE_DATA = join(SITE, 'data')
export const SITE_JBROWSE = join(SITE, 'jbrowse')
