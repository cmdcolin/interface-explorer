import type { SceneColors } from '../lib/scene.ts'

interface PointerTarget {
  target?: string
}

interface Observable<T> {
  subscribe(next: (value: T) => void): unknown
}

export interface PrismViewer {
  api: { run(id: string, values?: Record<string, unknown>): Promise<{ ok: boolean }> }
  events: { hover: Observable<PointerTarget>; click: Observable<PointerTarget> }
}

interface PrismModule {
  createPrismViewer(options: { target: HTMLElement; spec: object }): Promise<PrismViewer>
  DefaultPrismViewerSpec(): object
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

export function colors(): SceneColors {
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

function fail(host: HTMLElement, reason: string) {
  const status = host.querySelector('.structure-status')
  if (status) {
    status.textContent = `The 3D viewer did not load${reason}`
  }
  return undefined
}

export function reportFailure(host: HTMLElement, error: unknown) {
  return fail(host, `: ${error instanceof Error ? error.message : String(error)}`)
}

export async function createViewer(host: HTMLElement) {
  try {
    const module: unknown = await import(/* @vite-ignore */ new URL(host.dataset.src ?? '', location.href).href)
    return isPrismModule(module)
      ? await module.createPrismViewer({
          target: host,
          spec: {
            ...module.DefaultPrismViewerSpec(),
            options: {
              canvas: { background: colors().background },
              ui: { collapsed: true, showSequence: false, splash: false },
            },
            ui: { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' },
          },
        })
      : fail(host, '.')
  } catch (error) {
    return reportFailure(host, error)
  }
}

export function loadScene(viewer: PrismViewer, scene: object) {
  return viewer.api.run('load.mvs', { data: JSON.stringify(scene), format: 'mvsj' })
}
