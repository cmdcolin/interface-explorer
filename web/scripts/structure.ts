import { scene } from '../lib/scene.ts'
import type { ScenePartner, SceneVariant } from '../lib/scene.ts'
import { colors, createViewer, loadScene, reportFailure } from './prism.ts'
import type { PrismViewer } from './prism.ts'

interface StructureData {
  partners: ScenePartner[]
  variants: SceneVariant[]
}

function isStructureData(value: unknown): value is StructureData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'partners' in value &&
    Array.isArray(value.partners) &&
    'variants' in value &&
    Array.isArray(value.variants)
  )
}

function residueOf(target: string | undefined, chain: string) {
  const match = target?.match(/^([A-Za-z0-9]+):(-?\d+)/)
  return match?.[1] === chain ? Number(match[2]) : undefined
}

const host = document.querySelector<HTMLElement>('#structure')
const parsed: unknown = JSON.parse(document.querySelector('#structure-data')?.textContent ?? 'null')
const data = isStructureData(parsed) ? parsed : undefined
const map = document.querySelector<SVGSVGElement>('.protein-map')
const cursor = map?.querySelector<SVGGElement>('.map-cursor')
const linkable = [
  ...document.querySelectorAll<HTMLElement | SVGElement>('.protein-map .variant-mark, #variants tbody tr'),
]

const params = new URLSearchParams(location.search)
const asked = params.get('partner')?.toUpperCase()
const askedResidue = Number(params.get('residue'))

let viewer: PrismViewer | undefined
let current =
  data?.partners.find(p => p.gene.toUpperCase() === asked) ??
  data?.partners.find(p => p.gene === host?.dataset.initial) ??
  data?.partners[0]
let hovered: number | undefined
let pinned = Number.isInteger(askedResidue) && askedResidue > 0 ? askedResidue : undefined

function syncUrl() {
  const next = new URLSearchParams(location.search)
  if (current) {
    next.set('partner', current.gene)
  }
  if (pinned === undefined) {
    next.delete('residue')
  } else {
    next.set('residue', String(pinned))
  }
  history.replaceState(null, '', `?${next}${location.hash}`)
}

function showCursor(position: number | undefined) {
  const first = Number(map?.dataset.first)
  const last = Number(map?.dataset.last)
  const length = Number(map?.dataset.length)
  if (cursor && position !== undefined) {
    const x = first + ((position - 1) / Math.max(length - 1, 1)) * (last - first)
    cursor.setAttribute('transform', `translate(${x} 0)`)
    cursor.setAttribute('visibility', 'visible')
    const label = cursor.querySelector('text')
    if (label) {
      label.textContent = String(position)
    }
  } else {
    cursor?.setAttribute('visibility', 'hidden')
  }
  map?.classList.toggle('scrubbing', position !== undefined)
  for (const element of linkable) {
    element.classList.toggle('linked', position !== undefined && element.dataset.position === String(position))
  }
}

function highlight(position: number | undefined) {
  if (position !== hovered) {
    hovered = position
    showCursor(position ?? pinned)
    if (viewer && current) {
      void (position === undefined
        ? viewer.api.run('highlight.clear')
        : viewer.api.run('highlight.set', { target: `${current.chain}:${position}` }))
    }
  }
}

function focus(position: number) {
  pinned = position
  showCursor(hovered ?? pinned)
  if (viewer && current) {
    void viewer.api.run('focus.set', { target: `${current.chain}:${position}` })
  }
}

function pin(position: number) {
  focus(position)
  syncUrl()
}

function markPartner(gene: string) {
  for (const pick of document.querySelectorAll<HTMLElement>('.partner-pick')) {
    pick.setAttribute('aria-pressed', String(pick.dataset.partner === gene))
  }
  for (const story of document.querySelectorAll<HTMLElement>('.story')) {
    story.hidden = story.dataset.partner !== gene
  }
  for (const row of document.querySelectorAll<SVGGElement>('.partner-row')) {
    row.classList.toggle('active', (row.dataset.names ?? '').split(', ').includes(gene))
  }
}

async function show(partner: ScenePartner) {
  current = partner
  markPartner(partner.gene)
  if (viewer && data) {
    await loadScene(viewer, scene(partner, data.variants, colors()))
  }
}

function choose(gene: string | undefined) {
  const partner = data?.partners.find(p => p.gene === gene)
  return partner && partner !== current
    ? show(partner).then(() => {
        pinned = undefined
        showCursor(hovered)
        syncUrl()
      })
    : Promise.resolve()
}

function mapPosition(event: PointerEvent) {
  const matrix = map?.getScreenCTM()?.inverse()
  const first = Number(map?.dataset.first)
  const last = Number(map?.dataset.last)
  const length = Number(map?.dataset.length)
  const x = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix).x : Number.NaN
  const position = Math.round(((x - first) / (last - first)) * (length - 1)) + 1
  return position >= 1 && position <= length ? position : undefined
}

async function start() {
  if (host && data && current) {
    viewer = await createViewer(host)
    if (viewer) {
      const chainOf = () => current?.chain ?? 'A'
      viewer.events.hover.subscribe(e => {
        hovered = residueOf(e.target, chainOf())
        showCursor(hovered ?? pinned)
      })
      await show(current)
      if (pinned !== undefined) {
        focus(pinned)
      }
    }
  }
}

document.querySelectorAll<HTMLElement>('.partner-pick').forEach(pick =>
  pick.addEventListener('click', () => void choose(pick.dataset.partner)),
)

map?.addEventListener('pointermove', event => highlight(mapPosition(event)))
map?.addEventListener('pointerleave', () => highlight(undefined))
map?.addEventListener('click', event => {
  const position = mapPosition(event)
  const row = event.target instanceof Element ? event.target.closest<SVGGElement>('.partner-row') : null
  void choose(row?.dataset.partner).then(() => (position === undefined ? undefined : pin(position)))
})

document.querySelectorAll<HTMLTableRowElement>('#variants tbody tr').forEach(row => {
  row.addEventListener('mouseenter', () => highlight(Number(row.dataset.position)))
  row.addEventListener('mouseleave', () => highlight(undefined))
  row.addEventListener('click', event => {
    const partners = (row.dataset.partners ?? '').split(',')
    if (!(event.target instanceof Element && event.target.closest('a'))) {
      void choose(current && partners.includes(current.gene) ? current.gene : partners[0]).then(() => {
        pin(Number(row.dataset.position))
        host?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  })
})

if (current) {
  markPartner(current.gene)
}
showCursor(pinned)
void start().catch(error => (host ? reportFailure(host, error) : undefined))
