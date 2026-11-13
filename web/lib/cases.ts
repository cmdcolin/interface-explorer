import { isoform, isoformTotals } from './data.ts'
import { isoformMap, pathogenicSites } from './maps.ts'
import { href, isoformHref } from './site.ts'

export function appCase() {
  const app = isoform('APP')
  const pair = {
    ...app,
    isoforms: app.isoforms.filter(i =>
      ['APP695', 'APP751'].includes(i.name ?? ''),
    ),
  }
  return `
    ${isoformMap(pair)}
    <div class="actions">
      <a class="button primary" href="${isoformHref('APP')}">All ${app.isoforms.length} APP isoforms</a>
      <a class="button" href="${href('isoforms/')}">Isoforms of every gene</a>
    </div>`
}

export function appSites() {
  const { sites } = pathogenicSites(isoform('APP'))
  return {
    count: sites.length,
    first: Math.min(...sites),
    last: Math.max(...sites),
  }
}

export { isoformTotals }
