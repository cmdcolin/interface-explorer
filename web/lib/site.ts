const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')

export const JBROWSE = `${BASE}jbrowse/`

export function href(path = '') {
  return `${BASE}${path}`
}

export function geneHref(page: string) {
  return href(`gene/${encodeURIComponent(page)}/`)
}

export function isoformHref(page: string) {
  return href(`isoforms/${encodeURIComponent(page)}/`)
}
