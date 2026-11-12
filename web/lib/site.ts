import { jbrowseUrl } from '../../src/links.ts'

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')

export const JBROWSE = jbrowseUrl(
  new URL(`${BASE}jbrowse/config.json`, import.meta.env.SITE).href,
)

export function href(path = '') {
  return `${BASE}${path}`
}

export function geneHref(page: string) {
  return href(`gene/${encodeURIComponent(page)}/`)
}

export function isoformHref(page: string) {
  return href(`isoforms/${encodeURIComponent(page)}/`)
}
