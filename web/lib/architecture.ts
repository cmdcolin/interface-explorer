import { spawnSync } from 'node:child_process'

type Kind = 'step' | 'file' | 'viewer'

interface Node {
  id: string
  kind: Kind
  title: string
  source?: string
  chips?: string[]
  lines?: string[]
}

interface Edge {
  from: string
  to: string
  label?: string
}

interface Numbers {
  proteins: number
  contact: number
  ipsae: number
  plddt: number
}

export const COLUMNS = [
  'Fetch and compute',
  'Combine',
  'Published files',
  'In the browser',
]

export function nodes({ proteins, contact, ipsae, plddt }: Numbers): Node[] {
  return [
    {
      id: 'atlas',
      kind: 'step',
      source: 'UniProt · AlphaFold DB',
      title: 'Find interface residues',
      lines: [
        `${proteins.toLocaleString()} proteins, ≤ ${contact} Å`,
        `ipSAE ≥ ${ipsae}, pLDDT ≥ ${plddt}`,
      ],
    },
    {
      id: 'coords',
      kind: 'step',
      source: 'EBI Proteins API',
      title: 'Map residues to codons',
      chips: ['g2p_mapper'],
      lines: ['residue → codon'],
    },
    {
      id: 'clinvarStep',
      kind: 'step',
      source: 'ClinVar',
      title: 'Pathogenic variants',
      lines: ['missense SNVs'],
    },
    {
      id: 'amStep',
      kind: 'step',
      source: 'AlphaMissense',
      title: 'Pathogenicity scores',
      lines: ['per variant'],
    },
    {
      id: 'exp',
      kind: 'step',
      source: 'PDB · SIFTS',
      title: 'Check against PDB',
      lines: ['predicted vs PDB'],
    },
    {
      id: 'ppiStep',
      kind: 'step',
      source: 'IntAct · BioGRID',
      title: 'Reported interactions',
      lines: ['direct or same complex'],
    },
    {
      id: 'crossStep',
      kind: 'step',
      source: 'Complex Portal · STRING',
      title: 'Cross-references',
      lines: ['IDs and links'],
    },
    {
      id: 'cons',
      kind: 'step',
      source: 'UCSC phyloP',
      title: 'Conservation',
      chips: ['@gmod/bbi'],
      lines: ['per codon'],
    },
    {
      id: 'gnomad',
      kind: 'step',
      source: 'gnomAD v4.1',
      title: 'Population variants',
      chips: ['@gmod/bbi'],
      lines: ['variant counts'],
    },
    {
      id: 'gpcr',
      kind: 'step',
      source: 'GPCRdb · PDBe',
      title: 'GPCR complexes',
      chips: ['p2s_mapper'],
      lines: ['chain → UniProt'],
    },
    {
      id: 'iso',
      kind: 'step',
      source: 'AlphaFold DB',
      title: 'Isoform differences',
      lines: ['rebuild, compare folds'],
    },

    { id: 'out', kind: 'file', title: 'out/', lines: ['cached results'] },
    {
      id: 'tracks',
      kind: 'step',
      title: 'Genome tracks',
      lines: ['bigBed, config'],
    },
    {
      id: 'analyze',
      kind: 'step',
      title: 'Enrichment statistics',
      lines: ['odds ratios, CIs'],
    },
    {
      id: 'pages',
      kind: 'step',
      title: 'Gene page data',
      chips: ['p2s_mapper'],
      lines: ['one JSON per gene'],
    },

    {
      id: 'jbFiles',
      kind: 'file',
      title: 'site/jbrowse/',
      lines: ['bigBed, config.json'],
    },
    {
      id: 'data',
      kind: 'file',
      title: 'site/data/',
      lines: ['genes/, isoforms/', 'summary, leads, gpcr'],
    },

    {
      id: 'jbrowse',
      kind: 'viewer',
      title: 'JBrowse 2',
      lines: ['Protein3d, MsaView', 'UCSC tracks live'],
    },
    {
      id: 'astro',
      kind: 'viewer',
      title: 'Astro site',
      lines: ['static build', 'gene and leads pages'],
    },
    {
      id: 'prism',
      kind: 'viewer',
      title: 'Prism 3D viewer',
      lines: ['Mol* v6', 'AlphaFold DB live'],
    },
  ]
}

const toOut = [
  'atlas',
  'coords',
  'clinvarStep',
  'amStep',
  'exp',
  'ppiStep',
  'crossStep',
  'cons',
  'gnomad',
]

export const edges: Edge[] = [
  ...toOut.map(from => ({ from, to: 'out' })),
  { from: 'gpcr', to: 'data', label: 'straight to the site' },
  { from: 'iso', to: 'data' },
  { from: 'out', to: 'tracks' },
  { from: 'out', to: 'analyze' },
  { from: 'out', to: 'pages' },
  { from: 'analyze', to: 'pages' },
  { from: 'tracks', to: 'jbFiles' },
  { from: 'pages', to: 'data' },
  { from: 'jbFiles', to: 'jbrowse' },
  { from: 'data', to: 'astro' },
  { from: 'astro', to: 'prism' },
]

export const columns = [
  [...toOut, 'gpcr', 'iso'],
  ['out', 'tracks', 'analyze', 'pages'],
  ['jbFiles', 'data'],
  ['jbrowse', 'astro', 'prism'],
]

function quote(text: string) {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
}

function label(node: Node) {
  const body = [
    ...(node.chips ?? []).map(chip => `(${chip})`),
    ...(node.lines ?? []),
  ]
  return [
    ...(node.source
      ? [`<font color="gray40" point-size="14">${escapeHtml(node.source)}</font>`]
      : []),
    `<b>${escapeHtml(node.title)}</b>`,
    ...body.map(escapeHtml),
  ].join('<br/>')
}

const FETCH_STAGE = { fill: '#dbe9f8', area: '#eef4fb', line: '#4a7fb5' }

const STAGES = [
  FETCH_STAGE,
  { fill: '#f8e5bf', area: '#fbf3e4', line: '#b8832b' },
  { fill: '#e4d9f5', area: '#f3eefb', line: '#7a5aa6' },
  { fill: '#cdebdd', area: '#e9f6f0', line: '#3f9b78' },
]

const BYPASS = '#d0573a'

function nodeAttributes(node: Node, stage: (typeof STAGES)[number]) {
  return `${node.kind === 'file' ? 'shape=folder ' : ''}style=filled fillcolor="${stage.fill}" color="${stage.line}"`
}

function cluster(ids: string[], index: number, all: Node[]) {
  const stage = STAGES[index] ?? FETCH_STAGE
  const members = all.filter(node => ids.includes(node.id)).toReversed()
  return `subgraph cluster_${index} {
    label="${quote(COLUMNS[index] ?? '')}"
    style="rounded,filled" fillcolor="${stage.area}" color="${stage.line}"
    ${members.map(node => `${node.id} [label=<${label(node)}> ${nodeAttributes(node, stage)}];`).join('\n    ')}
  }`
}

function edgeAttributes(edge: Edge) {
  const bypass = edge.to === 'data' && edge.from !== 'pages'
  return [
    `color="${bypass ? BYPASS : 'gray40'}"`,
    `fontcolor="${BYPASS}"`,
    edge.label ? `label="${quote(edge.label)}"` : '',
  ].join(' ')
}

export function architectureDot(numbers: Numbers) {
  const all = nodes(numbers)
  return `digraph architecture {
  rankdir=LR
  bgcolor=white
  nodesep=0.12
  ranksep=0.35
  graph [fontname="Helvetica" fontsize=18]
  node [shape=box fontname="Helvetica" fontsize=18 penwidth=1.3]
  edge [fontname="Helvetica" fontsize=15 arrowsize=0.7]
  ${columns.map((ids, index) => cluster(ids, index, all)).join('\n  ')}
  ${edges.map(edge => `${edge.from} -> ${edge.to} [${edgeAttributes(edge)}];`).join('\n  ')}
}`
}

function bareSvg(svg: string) {
  return svg.slice(svg.indexOf('<svg')).replace(/<title>[\s\S]*?<\/title>/g, '')
}

function fail(message: string): never {
  throw new Error(message)
}

function renderDot(source: string) {
  const result = spawnSync('dot', ['-Tsvg'], {
    input: source,
    encoding: 'utf8',
  })
  const missing =
    result.error !== undefined &&
    'code' in result.error &&
    result.error.code === 'ENOENT'
  return missing
    ? fail(
        'Graphviz `dot` is not installed; install graphviz to build the site',
      )
    : result.status === 0
      ? result.stdout
      : fail(`dot failed: ${result.stderr}`)
}

export function architectureSvg(numbers: Numbers) {
  return bareSvg(renderDot(architectureDot(numbers)))
}
