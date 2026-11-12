import { complexSpec, geneLocus, sessionUrl } from '../../src/links.ts'
import { gene, isoform, isoformTotals } from './data.ts'
import { esc } from './html.ts'
import { isoformMap, proteinMap } from './maps.ts'
import { JBROWSE, geneHref, href, isoformHref } from './site.ts'
import { initialPartner } from './structure.ts'

export function geneCase(page: string) {
  const g = gene(page)
  const lead = initialPartner(g)
  const partner = g.partners.find(p => p.gene === lead)
  return `
    ${proteinMap(g)}
    <div class="actions">
      ${partner ? `<a class="button primary" href="${sessionUrl(complexSpec(g.gene, partner.entity, geneLocus(g)), JBROWSE)}">${esc(g.gene)}–${esc(partner.gene)} in 3D beside the genome</a>` : ''}
      <a class="button" href="${geneHref(g.page)}">All ${g.variants.length} variants</a>
    </div>`
}

export function vhl() {
  return gene('VHL')
}

export function gnao1() {
  return gene('GNAO1')
}

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

export { isoformTotals }
