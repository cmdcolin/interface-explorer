import { scene } from '../lib/scene.ts'
import type { SceneModel, ScenePartner, SceneVariant } from '../lib/scene.ts'
import { colors, createViewer, loadScene, reportFailure } from './prism.ts'

interface ComplexView {
  partner: ScenePartner
  variants: SceneVariant[]
  model: SceneModel
}

function isComplexView(value: unknown): value is ComplexView {
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
        viewer ? loadScene(viewer, scene(parsed.partner, parsed.variants, colors(), parsed.model)) : undefined,
      )
      .catch(error => reportFailure(host, error))
  }
}
