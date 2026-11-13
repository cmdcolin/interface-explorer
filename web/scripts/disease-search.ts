import { esc } from '../lib/html.ts'
import type { DiseaseRow } from '../lib/types.ts'

type Disease = Pick<DiseaseRow, 'page' | 'name' | 'causal' | 'genes' | 'pathogenic' | 'uncertain'>

const SHOWN = 8

function isDisease(value: unknown): value is Disease {
  return (
    typeof value === 'object' &&
    value !== null &&
    'page' in value &&
    typeof value.page === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'causal' in value &&
    Array.isArray(value.causal) &&
    'genes' in value &&
    typeof value.genes === 'number' &&
    'pathogenic' in value &&
    typeof value.pathogenic === 'number' &&
    'uncertain' in value &&
    typeof value.uncertain === 'number'
  )
}

function rank(disease: Disease, query: string) {
  const name = disease.name.toLowerCase()
  const gene = disease.causal.some(g => g.toLowerCase() === query)
  return name === query ? 0 : name.startsWith(query) ? 1 : gene ? 2 : name.split(/[\s,-]+/).some(w => w.startsWith(query)) ? 3 : name.includes(query) ? 4 : 5
}

function geneList(disease: Disease) {
  const shown = disease.causal.slice(0, 4).join(', ')
  return disease.causal.length > 4 ? `${shown} +${disease.causal.length - 4}` : shown
}

const form = document.querySelector<HTMLFormElement>('.disease-search')
const input = form?.querySelector<HTMLInputElement>('input[type="search"]')
const results = document.querySelector<HTMLOListElement>('.disease-results')
const words = [...document.querySelectorAll<SVGAElement>('.disease-cloud a')]
let loading: Promise<Disease[]> | undefined

function load() {
  loading ??= fetch(form?.dataset.index ?? '')
    .then(response => response.json())
    .then((rows: unknown) => (Array.isArray(rows) ? rows.filter(isDisease) : []))
    .catch(() => [])
  return loading
}

async function search() {
  const query = input?.value.trim().toLowerCase() ?? ''
  const diseases = await load()
  if (query === (input?.value.trim().toLowerCase() ?? '') && results) {
    const matches = query
      ? diseases
          .map(d => ({ d, rank: rank(d, query) }))
          .filter(m => m.rank < 5)
          .sort((a, b) => a.rank - b.rank || b.d.pathogenic - a.d.pathogenic)
      : []
    const pages = new Set(matches.map(m => m.d.page))
    for (const word of words) {
      word.classList.toggle('match', query !== '' && pages.has(word.dataset.page ?? ''))
      word.classList.toggle('dim', query !== '' && !pages.has(word.dataset.page ?? ''))
    }
    results.hidden = query === ''
    results.innerHTML = matches.length
      ? matches
          .slice(0, SHOWN)
          .map(
            ({ d }) =>
              `<li><a href="${form?.dataset.base ?? ''}${encodeURIComponent(d.page)}/">${esc(d.name)}</a> <span class="muted">${d.pathogenic} pathogenic, ${d.uncertain} uncertain · ${esc(geneList(d))}</span></li>`,
          )
          .join('') +
        (matches.length > SHOWN
          ? `<li class="more"><a href="${form?.action ?? ''}?q=${encodeURIComponent(input?.value.trim() ?? '')}">All ${matches.length} matches in the disease table</a></li>`
          : '')
      : '<li class="muted">No disease or gene matches.</li>'
  }
}

input?.addEventListener('focus', () => void load(), { once: true })
input?.addEventListener('input', () => void search())
