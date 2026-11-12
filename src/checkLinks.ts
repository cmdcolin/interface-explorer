import { existsSync, readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const BASE = '/interface-explorer/'
const EXTERNAL = /^(?:[a-z][a-z+.-]*:|\/\/)/i

export function internalTargets(html: string, page: string, base = BASE) {
  const from = `http://site${base}${dirname(page) === '.' ? '' : `${dirname(page)}/`}`
  return [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].flatMap(([, raw]) => {
    const url = (raw ?? '').replace(/&amp;/g, '&')
    const path = url.split(/[?#]/)[0] ?? ''
    return path === '' || EXTERNAL.test(url)
      ? []
      : [{ url, path: decodeURIComponent(new URL(path, from).pathname) }]
  })
}

export function targetFile(dist: string, path: string, base = BASE) {
  const inside = path.startsWith(base) ? path.slice(base.length) : undefined
  return inside === undefined
    ? undefined
    : join(dist, path.endsWith('/') ? join(inside, 'index.html') : inside)
}

async function main(dist = 'dist') {
  const broken = new Map<string, string>()
  let pages = 0
  let links = 0
  for await (const page of glob('**/*.html', { cwd: dist })) {
    pages += 1
    for (const { path } of internalTargets(
      readFileSync(join(dist, page), 'utf8'),
      page,
    )) {
      links += 1
      const file = targetFile(dist, path)
      if (!file || !existsSync(file)) {
        broken.set(path, page)
      }
    }
  }
  console.log(
    `${pages} pages, ${links} internal links, ${broken.size} broken targets`,
  )
  for (const [path, page] of [...broken].slice(0, 30)) {
    console.log(`  ${path}  (from ${page})`)
  }
  process.exitCode = broken.size ? 1 : 0
}

if (import.meta.main) {
  await main(...process.argv.slice(2))
}
