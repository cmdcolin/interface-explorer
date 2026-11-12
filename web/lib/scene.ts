import { LABEL_KEYS } from './html.ts'
import type { Label } from './types.ts'

export interface ScenePartner {
  gene: string
  entity: string
  chain: string
  residues: number[]
}

export interface SceneVariant {
  change: string
  label: Label
  position: number
  partners: string[]
}

export interface SceneColors {
  background: string
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

export function modelUrl(entity: string) {
  return `https://alphafold.ebi.ac.uk/files/${entity}-model_v1.bcif`
}

export function otherChain(chain: string) {
  return chain === 'A' ? 'B' : 'A'
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

export function sites(partner: ScenePartner, variants: SceneVariant[]) {
  return [...Map.groupBy(variants.filter(v => v.partners.includes(partner.gene)), v => v.position)]
    .map(([position, here]) => ({
      position,
      residue: here[0]?.change[0] ?? '',
      label: LABEL_KEYS.find(label => here.some(v => v.label === label)) ?? 'benign',
      pathogenic: here.filter(v => v.label === 'pathogenic').length,
      byLabel: LABEL_KEYS.map(label => [label, here.filter(v => v.label === label).map(v => v.change)] as const).filter(
        ([, changes]) => changes.length,
      ),
    }))
    .sort((a, b) => a.position - b.position)
}

export function scene(partner: ScenePartner, variants: SceneVariant[], colors: SceneColors) {
  const own = partner.chain
  const other = otherChain(own)
  const interfaceSelector = ranges(partner.residues).map(([beg, end]) => ({
    auth_asym_id: own,
    beg_auth_seq_id: beg,
    end_auth_seq_id: end,
  }))
  const here = sites(partner, variants)
  const labelled = new Set(
    here
      .filter(s => s.pathogenic)
      .toSorted((a, b) => b.pathogenic - a.pathogenic)
      .slice(0, LABELLED_SITES)
      .map(s => s.position),
  )
  const structure = node('structure', { type: 'model' }, [
    node('component', { selector: { auth_asym_id: own } }, [
      node('representation', { type: 'cartoon' }, [
        node('color', { color: colors.chain }),
        ...(interfaceSelector.length ? [node('color', { color: colors.interface, selector: interfaceSelector })] : []),
      ]),
    ]),
    node('component', { selector: { auth_asym_id: other } }, [
      node('representation', { type: 'cartoon' }, [node('color', { color: colors.partner })]),
      node('representation', { type: 'surface' }, [
        node('color', { color: colors.partner }),
        node('opacity', { opacity: 0.28 }),
      ]),
    ]),
    ...here.map(s =>
      node('component', { selector: { auth_asym_id: own, auth_seq_id: s.position } }, [
        node('representation', { type: 'ball_and_stick', size_factor: 1.3 }, [node('color', { color: colors[s.label] })]),
        node('tooltip', {
          text: `${s.residue}${s.position}: ${s.byLabel.map(([label, changes]) => `${label} ${changes.join(', ')}`).join('; ')}`,
        }),
        ...(labelled.has(s.position) ? [node('label', { text: `${s.residue}${s.position}` })] : []),
      ]),
    ),
    ...(interfaceSelector.length
      ? [node('component', { selector: interfaceSelector }, [node('focus', { radius_factor: 1.4 })])]
      : []),
  ])
  return {
    kind: 'single',
    metadata: { version: '1', title: `${partner.gene} complex` },
    root: node('root', {}, [
      node('canvas', { background_color: colors.background }),
      node('download', { url: modelUrl(partner.entity) }, [node('parse', { format: 'bcif' }, [structure])]),
    ]),
  }
}
