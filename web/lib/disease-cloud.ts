import { esc } from './html.ts'
import { diseaseHref } from './site.ts'
import type { DiseaseRow } from './types.ts'
import { wordCloud } from './wordcloud.ts'

function cloud(diseases: DiseaseRow[], layout: { width: number; height: number; count: number; min: number; max: number }, className: string) {
  const words = wordCloud(
    diseases
      .toSorted((a, b) => b.pathogenic - a.pathogenic)
      .slice(0, layout.count)
      .map(d => ({ text: d.name, weight: d.pathogenic, group: d.pairs > 0, disease: d })),
    layout.width,
    layout.height,
    layout.min,
    layout.max,
  )
  return `<svg class="disease-cloud ${className}" viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-label="The diseases with most pathogenic variants at a predicted interface">${words
    .map(
      w =>
        `<a href="${diseaseHref(w.disease.page)}" data-page="${esc(w.disease.page)}"><text class="${w.group ? 'paired' : ''}" x="${w.x.toFixed(1)}" y="${w.y.toFixed(1)}" font-size="${w.size.toFixed(1)}">${esc(w.text)}<title>${esc(w.text)}: ${w.disease.pathogenic} pathogenic and ${w.disease.uncertain} uncertain variants at an interface, in ${w.disease.genes} ${w.disease.genes === 1 ? 'gene' : 'genes'}</title></text></a>`,
    )
    .join('')}</svg>`
}

export function diseaseClouds(diseases: DiseaseRow[]) {
  return (
    cloud(diseases, { width: 1000, height: 440, count: 140, min: 11, max: 32 }, 'wide') +
    cloud(diseases, { width: 400, height: 520, count: 50, min: 11, max: 22 }, 'narrow')
  )
}
