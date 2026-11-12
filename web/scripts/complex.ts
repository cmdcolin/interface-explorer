import { scene } from '../lib/scene.ts'
import type { SceneView } from '../lib/scene.ts'
import { colors, createViewer, loadScene, reportFailure } from './prism.ts'

function isComplexView(value: unknown): value is SceneView {
  return (
    typeof value === 'object' &&
    value !== null &&
    'partner' in value &&
    typeof value.partner === 'object' &&
    'variants' in value &&
    Array.isArray(value.variants) &&
    'model' in value &&
    typeof value.model === 'object'
  )
}

for (const host of document.querySelectorAll<HTMLElement>('.complex-view .structure')) {
  const parsed: unknown = JSON.parse(host.dataset.view ?? 'null')
  if (isComplexView(parsed)) {
    void createViewer(host)
      .then(viewer =>
        viewer ? loadScene(viewer, scene(parsed.partner, parsed.variants, colors(), parsed.model, parsed.regions)) : undefined,
      )
      .catch(error => reportFailure(host, error))
  }
}
