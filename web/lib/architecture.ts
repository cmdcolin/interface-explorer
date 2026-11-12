import { spawnSync } from 'node:child_process'

type Kind = 'source' | 'step' | 'file' | 'viewer'

interface Node {
  id: string
  kind: Kind
  title: string
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

const COLORS = {
  text: ['#000001', 'var(--text)'],
  text2: ['#000002', 'var(--text-2)'],
  border: ['#000003', 'var(--border)'],
  partner: ['#000004', 'var(--partner)'],
} as const

const color = (name: keyof typeof COLORS) => COLORS[name][0]

export const COLUMNS = [
  'Sources',
  'Fetch and compute',
  'Combine',
  'Published files',
  'In the browser',
]

export function nodes({ proteins, contact, ipsae, plddt }: Numbers): Node[] {
  return [
    {
      id: 'uniprot',
      kind: 'source',
      title: 'UniProt · AlphaFold DB',
      lines: [
        `${proteins.toLocaleString()} disease proteins`,
        'heterodimer and homodimer models',
      ],
    },
    {
      id: 'ebi',
      kind: 'source',
      title: 'EBI Proteins API',
      lines: ['exons on hg38'],
    },
    {
      id: 'clinvar',
      kind: 'source',
      title: 'ClinVar',
      lines: ['weekly variant_summary'],
    },
    {
      id: 'am',
      kind: 'source',
      title: 'AlphaMissense',
      lines: ['every substitution'],
    },
    {
      id: 'pdb',
      kind: 'source',
      title: 'RCSB PDB · PDBe SIFTS',
      lines: ['experimental complexes'],
    },
    {
      id: 'ppi',
      kind: 'source',
      title: 'IntAct · BioGRID',
      lines: ['reported human pairs'],
    },
    {
      id: 'crossSource',
      kind: 'source',
      title: 'Complex Portal · STRING',
      lines: ['curated complexes, IDs'],
    },
    {
      id: 'ucsc',
      kind: 'source',
      title: 'UCSC phyloP 100-way',
      lines: ['hg38 bigWig'],
    },
    {
      id: 'gnomadSource',
      kind: 'source',
      title: 'gnomAD v4.1 exomes',
      lines: ['hg38 bigBed'],
    },
    {
      id: 'gpcrdb',
      kind: 'source',
      title: 'GPCRdb · PDBe',
      lines: ['receptor–G protein structures'],
    },
    {
      id: 'afdbIso',
      kind: 'source',
      title: 'AlphaFold DB isoforms',
      lines: ['monomer models'],
    },

    {
      id: 'atlas',
      kind: 'step',
      title: 'Find interface residues',
      lines: [
        `contacts ≤ ${contact} Å, ipSAE ≥ ${ipsae}`,
        `pLDDT ≥ ${plddt}, solvent exposure`,
      ],
    },
    {
      id: 'coords',
      kind: 'step',
      title: 'Map residues to codons',
      chips: ['g2p_mapper'],
      lines: ['residue → codon'],
    },
    {
      id: 'clinvarStep',
      kind: 'step',
      title: 'Pathogenic variants',
      lines: ['missense SNVs, canonical'],
    },
    {
      id: 'amStep',
      kind: 'step',
      title: 'Pathogenicity scores',
      lines: ['AlphaMissense per variant'],
    },
    {
      id: 'exp',
      kind: 'step',
      title: 'Check against PDB',
      lines: ['predicted pair vs PDB'],
    },
    {
      id: 'ppiStep',
      kind: 'step',
      title: 'Reported interactions',
      lines: ['direct or same complex'],
    },
    {
      id: 'crossStep',
      kind: 'step',
      title: 'Cross-references',
      lines: ['IDs and links for each pair'],
    },
    {
      id: 'cons',
      kind: 'step',
      title: 'Conservation',
      chips: ['@gmod/bbi'],
      lines: ['per codon'],
    },
    {
      id: 'gnomad',
      kind: 'step',
      title: 'Population variants',
      chips: ['@gmod/bbi'],
      lines: ['variant counts'],
    },
    {
      id: 'gpcr',
      kind: 'step',
      title: 'GPCR complexes',
      chips: ['p2s_mapper'],
      lines: ['chain → UniProt'],
    },
    {
      id: 'iso',
      kind: 'step',
      title: 'Isoform differences',
      lines: ['rebuild, compare folds'],
    },

    { id: 'out', kind: 'file', title: 'out/', lines: ['cached results'] },
    {
      id: 'tracks',
      kind: 'step',
      title: 'Genome tracks',
      lines: ['BED → bigBed', 'JBrowse config'],
    },
    {
      id: 'analyze',
      kind: 'step',
      title: 'Enrichment statistics',
      lines: ['Mantel–Haenszel odds', 'ratios, resampled CIs'],
    },
    {
      id: 'pages',
      kind: 'step',
      title: 'Gene page data',
      chips: ['p2s_mapper'],
      lines: ['one JSON file per gene'],
    },

    {
      id: 'jbFiles',
      kind: 'file',
      title: 'site/jbrowse/',
      lines: ['bigBed tracks', 'config.json'],
    },
    {
      id: 'data',
      kind: 'file',
      title: 'site/data/',
      lines: [
        'genes/*.json',
        'genes.json, leads.json',
        'summary.json, gpcr.json',
        'isoforms/*.json',
      ],
    },

    {
      id: 'jbrowse',
      kind: 'viewer',
      title: 'JBrowse 2',
      lines: [
        'Protein3d, MsaView,',
        'opens at a variant;',
        'UCSC tracks fetched live',
      ],
    },
    {
      id: 'astro',
      kind: 'viewer',
      title: 'Astro site',
      lines: ['astro build → static', 'gene, leads, isoform', 'pages, blog'],
    },
    {
      id: 'prism',
      kind: 'viewer',
      title: 'Prism 3D viewer',
      lines: [
        'Mol* v6 build in gene',
        'pages; AlphaFold DB',
        'structures fetched live',
      ],
    },
  ]
}

export const edges: Edge[] = [
  { from: 'uniprot', to: 'atlas' },
  { from: 'ebi', to: 'coords' },
  { from: 'clinvar', to: 'clinvarStep' },
  { from: 'am', to: 'amStep' },
  { from: 'pdb', to: 'exp' },
  { from: 'ppi', to: 'ppiStep' },
  { from: 'crossSource', to: 'crossStep' },
  { from: 'ucsc', to: 'cons' },
  { from: 'gnomadSource', to: 'gnomad' },
  { from: 'gpcrdb', to: 'gpcr' },
  { from: 'afdbIso', to: 'iso' },
  ...[
    'atlas',
    'coords',
    'clinvarStep',
    'amStep',
    'exp',
    'ppiStep',
    'crossStep',
    'cons',
    'gnomad',
  ].map(from => ({ from, to: 'out' })),
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
  [
    'uniprot',
    'ebi',
    'clinvar',
    'am',
    'pdb',
    'ppi',
    'crossSource',
    'ucsc',
    'gnomadSource',
    'gpcrdb',
    'afdbIso',
  ],
  [
    'atlas',
    'coords',
    'clinvarStep',
    'amStep',
    'exp',
    'ppiStep',
    'crossStep',
    'cons',
    'gnomad',
    'gpcr',
    'iso',
  ],
  ['out', 'tracks', 'analyze', 'pages'],
  ['jbFiles', 'data'],
  ['jbrowse', 'astro', 'prism'],
]

function quote(text: string) {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function label(node: Node) {
  return [
    node.title,
    ...(node.chips ?? []).map(chip => `(${chip})`),
    ...(node.lines ?? []),
  ]
    .map(quote)
    .join('\\n')
}

function nodeAttributes(node: Node) {
  return node.kind === 'file'
    ? 'shape=folder'
    : node.kind === 'viewer'
      ? `color="${color('partner')}" penwidth=1.5`
      : ''
}

function cluster(ids: string[], index: number, all: Node[]) {
  const members = all.filter(node => ids.includes(node.id)).toReversed()
  return `subgraph cluster_${index} {
    label="${quote(COLUMNS[index] ?? '')}"
    ${members.map(node => `${node.id} [label="${label(node)}" ${nodeAttributes(node)}];`).join('\n    ')}
  }`
}

export function architectureDot(numbers: Numbers) {
  const all = nodes(numbers)
  return `digraph architecture {
  rankdir=LR
  bgcolor=transparent
  nodesep=0.25
  ranksep=0.6
  graph [fontname="Helvetica" fontsize=15 fontcolor="${color('text2')}" color="${color('border')}" style=rounded]
  node [shape=box fontname="Helvetica" fontsize=14 color="${color('text2')}" fontcolor="${color('text')}"]
  edge [fontname="Helvetica" fontsize=12 color="${color('text2')}" fontcolor="${color('text2')}" arrowsize=0.7]
  ${columns.map((ids, index) => cluster(ids, index, all)).join('\n  ')}
  ${edges.map(edge => `${edge.from} -> ${edge.to}${edge.label ? ` [label="${quote(edge.label)}"]` : ''};`).join('\n  ')}
}`
}

function theme(svg: string) {
  return Object.values(COLORS).reduce(
    (out, [sentinel, variable]) =>
      out
        .replaceAll(`"${sentinel}"`, `"${variable}"`)
        .replaceAll(`: ${sentinel}`, `: ${variable}`),
    svg,
  )
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
  return bareSvg(theme(renderDot(architectureDot(numbers))))
}
