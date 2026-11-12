import { expect, test } from 'vitest'

import { ranges, scene, sites } from './scene.ts'
import type { SceneVariant } from './scene.ts'

const partner = { gene: 'ELOC', entity: 'AF-1', chain: 'B', residues: [5, 6, 7, 9] }
const colors = {
  background: '#fff',
  chain: '#ccc',
  partner: '#0a0',
  interface: '#00f',
  pathogenic: '#f00',
  uncertain: '#fa0',
  benign: '#888',
}
const variants: SceneVariant[] = [
  { change: 'R5C', label: 'uncertain', position: 5, partners: ['ELOC'] },
  { change: 'R5H', label: 'pathogenic', position: 5, partners: ['ELOC'] },
  { change: 'L9P', label: 'benign', position: 9, partners: ['ELOC'] },
  { change: 'G40S', label: 'pathogenic', position: 40, partners: ['CUL2'] },
]

function kinds(node: { kind: string; children?: unknown[] }): string[] {
  return [
    node.kind,
    ...(node.children ?? []).flatMap(child =>
      typeof child === 'object' && child !== null && 'kind' in child && typeof child.kind === 'string'
        ? kinds({ kind: child.kind, children: 'children' in child && Array.isArray(child.children) ? child.children : [] })
        : [],
    ),
  ]
}

test('consecutive residues become ranges', () => {
  expect(ranges([9, 5, 6, 7, 6])).toEqual([
    [5, 7],
    [9, 9],
  ])
})

test('a site takes its most severe label and lists the changes under each', () => {
  expect(sites(variants.filter(v => v.partners.includes('ELOC')))).toEqual([
    {
      position: 5,
      residue: 'R',
      label: 'pathogenic',
      pathogenic: 1,
      byLabel: [
        ['pathogenic', ['R5H']],
        ['uncertain', ['R5C']],
      ],
    },
    { position: 9, residue: 'L', label: 'benign', pathogenic: 0, byLabel: [['benign', ['L9P']]] },
  ])
})

test('the scene loads the complex, labels pathogenic sites and focuses the interface', () => {
  const spec = scene(partner, variants, colors)
  const text = JSON.stringify(spec)
  expect(text).toContain('https://alphafold.ebi.ac.uk/files/AF-1-model_v1.bcif')
  expect(text).toContain('{"selector":{"auth_asym_id":"B"}}')
  expect(text).toContain('{"selector":{"auth_asym_id":"A"}}')
  expect(text).toContain('"text":"R5"')
  expect(text).not.toContain('"text":"L9"')
  expect(text).not.toContain('G40S')
  expect(kinds(spec.root).filter(kind => kind === 'focus')).toHaveLength(1)
})

test("a partner that is a disease protein too gets its own interface and variants painted", () => {
  const text = JSON.stringify(
    scene(
      {
        ...partner,
        side: {
          page: 'ELOC',
          residues: [100, 101],
          variants: [{ change: 'A100V', label: 'pathogenic', position: 100, partners: ['VHL'] }],
        },
      },
      variants,
      colors,
    ),
  )
  expect(text).toContain('{"auth_asym_id":"A","beg_auth_seq_id":100,"end_auth_seq_id":101}')
  expect(text).toContain('"selector":{"auth_asym_id":"A","auth_seq_id":100}')
  expect(text).toContain('"text":"ELOC A100"')
})
