import { scene } from '../lib/scene.ts'
import type { SceneColors, ScenePartner, SceneVariant } from '../lib/scene.ts'

interface PointerTarget {
  target?: string
}

interface Observable<T> {
  subscribe(next: (value: T) => void): unknown
}

interface PrismViewer {
  api: { run(id: string, values?: Record<string, unknown>): Promise<{ ok: boolean }> }
  events: { hover: Observable<PointerTarget>; click: Observable<PointerTarget> }
}

interface PrismModule {
  createPrismViewer(options: { target: HTMLElement; spec: object }): Promise<PrismViewer>
  DefaultPrismViewerSpec(): object
}

interface StructureData {
  partners: ScenePartner[]
  variants: SceneVariant[]
}

function isPrismModule(value: unknown): value is PrismModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createPrismViewer' in value &&
    typeof value.createPrismViewer === 'function' &&
    'DefaultPrismViewerSpec' in value &&
    typeof value.DefaultPrismViewerSpec === 'function'
  )
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

function colors(): SceneColors {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim()
  return {
    background: token('surface'),
    chain: token('chain'),
    partner: token('partner'),
    interface: token('interface'),
    pathogenic: token('pathogenic'),
    uncertain: token('uncertain'),
    benign: token('benign'),
  }
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

let viewer: PrismViewer | undefined
let current = data?.partners.find(p => p.gene === host?.dataset.initial) ?? data?.partners[0]
let hovered: number | undefined

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
    showCursor(position)
    if (viewer && current) {
      void (position === undefined
        ? viewer.api.run('highlight.clear')
        : viewer.api.run('highlight.set', { target: `${current.chain}:${position}` }))
    }
  }
}

function focus(position: number) {
  if (viewer && current) {
    void viewer.api.run('focus.set', { target: `${current.chain}:${position}` })
  }
}

function markPartner(gene: string) {
  for (const pick of document.querySelectorAll<HTMLElement>('.partner-pick')) {
    pick.setAttribute('aria-pressed', String(pick.dataset.partner === gene))
  }
  for (const story of document.querySelectorAll<HTMLElement>('.story')) {
    story.hidden = story.dataset.partner !== gene
  }
  for (const row of document.querySelectorAll<SVGGElement>('.partner-row')) {
    row.classList.toggle('active', row.dataset.partner === gene)
  }
}

async function show(partner: ScenePartner) {
  current = partner
  markPartner(partner.gene)
  if (viewer && data) {
    await viewer.api.run('load.mvs', {
      data: JSON.stringify(scene(partner, data.variants, colors())),
      format: 'mvsj',
    })
  }
}

function choose(gene: string | undefined) {
  const partner = data?.partners.find(p => p.gene === gene)
  return partner && partner !== current ? show(partner) : Promise.resolve()
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
    const status = host.querySelector('.structure-status')
    try {
      const module: unknown = await import(/* @vite-ignore */ new URL(host.dataset.src ?? '', location.href).href)
      if (isPrismModule(module)) {
        const dark = matchMedia('(prefers-color-scheme: dark)').matches
        viewer = await module.createPrismViewer({
          target: host,
          spec: {
            ...module.DefaultPrismViewerSpec(),
            options: {
              canvas: { background: colors().background },
              ui: { collapsed: true, showSequence: false, splash: false },
            },
            ui: { theme: dark ? 'dark' : 'light' },
          },
        })
        const chainOf = () => current?.chain ?? 'A'
        viewer.events.hover.subscribe(e => {
          hovered = residueOf(e.target, chainOf())
          showCursor(hovered)
        })
        await show(current)
      } else if (status) {
        status.textContent = 'The 3D viewer did not load.'
      }
    } catch (error) {
      if (status) {
        status.textContent = `The 3D viewer did not load: ${error instanceof Error ? error.message : String(error)}`
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
  void choose(row?.dataset.partner).then(() => (position === undefined ? undefined : focus(position)))
})

document.querySelectorAll<HTMLTableRowElement>('#variants tbody tr').forEach(row => {
  row.addEventListener('mouseenter', () => highlight(Number(row.dataset.position)))
  row.addEventListener('mouseleave', () => highlight(undefined))
})

if (current) {
  markPartner(current.gene)
}
void start()
