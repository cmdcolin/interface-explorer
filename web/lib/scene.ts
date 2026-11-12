import { LABEL_KEYS } from './html.ts'
import type { Label } from './types.ts'

export interface ScenePartner {
  gene: string
  entity: string
  chain: string
  residues: number[]
  side?: { residues: number[]; variants: SceneVariant[] }
}

export interface SceneModel {
  url: string
  partnerChain: string
  up?: number[]
  frame?: 'interface' | 'complex'
}

export interface SceneVariant {
  change: string
  label: Label
  position: number
  partners: string[]
}

export interface SceneRegion {
  text: string
  at: number[] | { chain: string; residues: number[] }
}

export interface SceneView {
  partner: ScenePartner
  variants: SceneVariant[]
  model: SceneModel
  regions?: SceneRegion[]
}

export interface SceneColors {
  background: string
  text: string
  chain: string
  partner: string
  interface: string
  pathogenic: string
  uncertain: string
  benign: string
}

interface Node {
  kind: string
  params?: Record<string, unknown>
  children?: Node[]
}

const LABELLED_SITES = 3
const LABELLED_PARTNER_SITES = 2

export function modelUrl(entity: string) {
  return `https://alphafold.ebi.ac.uk/files/${entity}-model_v1.bcif`
}

export function otherChain(chain: string) {
  return chain === 'A' ? 'B' : 'A'
}

export function pdbModel(pdb: string, partnerChain: string, up?: number[]) {
  return {
    url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdb.toLowerCase()}.bcif`,
    partnerChain,
    ...(up ? { up } : {}),
  }
}

export function sideways([x = 0, y = 0, z = 1]: number[]) {
  const [a, b, c] = Math.abs(z) < 0.9 ? [y, -x, 0] : [0, z, -y]
  const length = Math.hypot(a, b, c)
  return [a / length, b / length, c / length]
}

function afdbModel(partner: ScenePartner) {
  return { url: modelUrl(partner.entity), partnerChain: otherChain(partner.chain) }
}

function node(kind: string, params?: Record<string, unknown>, children?: Node[]): Node {
  return { kind, ...(params ? { params } : {}), ...(children ? { children } : {}) }
}

export function ranges(residues: number[]) {
  const sorted = [...new Set(residues)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const r of sorted) {
    const last = out.at(-1)
    if (last && last[1] === r - 1) {
      last[1] = r
    } else {
      out.push([r, r])
    }
  }
  return out
}

export function sites(variants: SceneVariant[]) {
  return [...Map.groupBy(variants, v => v.position)]
    .map(([position, here]) => ({
      position,
      name: here[0]?.change.slice(0, -1) ?? '',
      label: LABEL_KEYS.find(label => here.some(v => v.label === label)) ?? 'benign',
      pathogenic: here.filter(v => v.label === 'pathogenic').length,
      byLabel: LABEL_KEYS.map(label => [label, here.filter(v => v.label === label).map(v => v.change)] as const).filter(
        ([, changes]) => changes.length,
      ),
    }))
    .sort((a, b) => a.position - b.position)
}

function interfaceSelector(chain: string, residues: number[]) {
  return ranges(residues).map(([beg, end]) => ({ auth_asym_id: chain, beg_auth_seq_id: beg, end_auth_seq_id: end }))
}

function siteNodes(chain: string, here: ReturnType<typeof sites>, colors: SceneColors, prefix: string, labels: number) {
  const labelled = new Set(
    here
      .filter(s => s.pathogenic)
      .toSorted((a, b) => b.pathogenic - a.pathogenic)
      .slice(0, labels)
      .map(s => s.position),
  )
  return here.map(s =>
    node('component', { selector: { auth_asym_id: chain, auth_seq_id: s.position } }, [
      node('representation', { type: 'ball_and_stick', size_factor: 1.3 }, [node('color', { color: colors[s.label] })]),
      node('tooltip', {
        text: `${prefix}${s.name}: ${s.byLabel.map(([label, changes]) => `${label} ${changes.join(', ')}`).join('; ')}`,
      }),
      ...(labelled.has(s.position) ? [node('label', { text: `${prefix}${s.name}` })] : []),
    ]),
  )
}

const REGION_LABEL_SIZE = 6
const REGION_LABEL_OFFSET = 3

function regionLabels(regions: SceneRegion[], colors: SceneColors) {
  return regions.length
    ? [
        node(
          'primitives',
          { label_color: colors.text },
          regions.map(region =>
            node('primitive', {
              kind: 'label',
              position: Array.isArray(region.at)
                ? region.at
                : { expressions: interfaceSelector(region.at.chain, region.at.residues) },
              text: region.text,
              label_size: REGION_LABEL_SIZE,
              label_offset: REGION_LABEL_OFFSET,
            }),
          ),
        ),
      ]
    : []
}

function cartoon(base: string, highlight: ReturnType<typeof interfaceSelector>, colors: SceneColors) {
  return node('representation', { type: 'cartoon' }, [
    node('color', { color: base }),
    ...(highlight.length ? [node('color', { color: colors.interface, selector: highlight })] : []),
  ])
}

export function scene(
  partner: ScenePartner,
  variants: SceneVariant[],
  colors: SceneColors,
  model: SceneModel = afdbModel(partner),
  regions: SceneRegion[] = [],
) {
  const own = partner.chain
  const other = model.partnerChain
  const ownInterface = interfaceSelector(own, partner.residues)
  const otherInterface = interfaceSelector(other, partner.side?.residues ?? [])
  const structure = node('structure', { type: 'model' }, [
    node('component', { selector: { auth_asym_id: own } }, [cartoon(colors.chain, ownInterface, colors)]),
    node('component', { selector: { auth_asym_id: other } }, [
      cartoon(colors.partner, otherInterface, colors),
      node('representation', { type: 'surface' }, [
        node('color', { color: colors.partner }),
        node('opacity', { opacity: 0.28 }),
      ]),
    ]),
    ...siteNodes(own, sites(variants.filter(v => v.partners.includes(partner.gene))), colors, '', LABELLED_SITES),
    ...siteNodes(other, sites(partner.side?.variants ?? []), colors, `${partner.gene} `, LABELLED_PARTNER_SITES),
    ...regionLabels(regions, colors),
    ...(ownInterface.length
      ? [
          node(
            'component',
            {
              selector:
                model.frame === 'complex'
                  ? [{ auth_asym_id: own }, { auth_asym_id: other }]
                  : [...ownInterface, ...otherInterface],
            },
            [node('focus', { radius_factor: model.frame === 'complex' ? 0.72 : 1.4, ...(model.up ? { up: model.up, direction: sideways(model.up) } : {}) })],
          ),
        ]
      : []),
  ])
  return {
    kind: 'single',
    metadata: { version: '1', title: `${partner.gene} complex` },
    root: node('root', {}, [
      node('canvas', { background_color: colors.background }),
      node('download', { url: model.url }, [node('parse', { format: 'bcif' }, [structure])]),
    ]),
  }
}
