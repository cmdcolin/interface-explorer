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
  surface: ['#000004', 'var(--surface)'],
  surface2: ['#000005', 'var(--surface-2)'],
  partner: ['#000006', 'var(--partner)'],
  interface: ['#000007', 'var(--interface)'],
  chipText: ['#000008', 'var(--chip-text)'],
} as const

const color = (name: keyof typeof COLORS) => COLORS[name][0]

const SANS = 'Helvetica'
const MONO = 'Courier'

export const COLUMNS = [
  'Sources',
  'Fetch and compute',
  'Cache',
  'Combine',
  'Published files',
  'In the browser',
]

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

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
  ['out'],
  ['tracks', 'analyze', 'pages'],
  ['jbFiles', 'data'],
  ['jbrowse', 'astro', 'prism'],
]

const WIDTHS = [3.0, 2.6, 1.8, 2.0, 1.9, 1.9]

function nodeWidth(node: Node) {
  return WIDTHS[columns.findIndex(ids => ids.includes(node.id))] ?? 2
}

function label(node: Node) {
  const face = node.kind === 'file' ? MONO : SANS
  const chips = (node.chips ?? [])
    .map(
      chip =>
        `<TD BGCOLOR="${color('interface')}" STYLE="rounded" CELLPADDING="2" FIXEDSIZE="TRUE" WIDTH="${chip.length * 6 + 14}" HEIGHT="16"><FONT FACE="${MONO}" POINT-SIZE="10" COLOR="${color('chipText')}">${escapeHtml(chip)}</FONT></TD>`,
    )
    .join('')
  const rows = [
    `<TR><TD ALIGN="LEFT" COLSPAN="2" WIDTH="${Math.round(nodeWidth(node) * 72 - 22)}"><FONT FACE="${face}" POINT-SIZE="13" COLOR="${color('text')}"><B>${escapeHtml(node.title)}</B></FONT></TD></TR>`,
    ...(chips
      ? [
          `<TR><TD ALIGN="LEFT" COLSPAN="2"><TABLE ALIGN="LEFT" BORDER="0" CELLBORDER="0" CELLSPACING="3" CELLPADDING="0"><TR>${chips}</TR></TABLE></TD></TR>`,
        ]
      : []),
    ...(node.lines ?? []).map(
      line =>
        `<TR><TD ALIGN="LEFT" COLSPAN="2"><FONT FACE="${SANS}" POINT-SIZE="11" COLOR="${color('text2')}">${escapeHtml(line)}</FONT></TD></TR>`,
    ),
  ]
  return `<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="1">${rows.join('')}</TABLE>>`
}

function nodeSize(node: Node) {
  return `width=${nodeWidth(node)} height=0.8`
}

function nodeStyle(node: Node) {
  return node.kind === 'viewer'
    ? `style="rounded,filled" fillcolor="${color('surface2')}" color="${color('partner')}" penwidth=1.5`
    : node.kind === 'file'
      ? `style="rounded,filled" fillcolor="${color('surface2')}" color="${color('border')}" penwidth=1.5`
      : node.kind === 'source'
        ? `style="rounded,filled" fillcolor="${color('surface')}" color="${color('border')}"`
        : `style="rounded,filled" fillcolor="${color('surface2')}" color="${color('border')}"`
}

function edgeStyle(edge: Edge) {
  return `${edge.label ? `xlabel=<<FONT FACE="${SANS}" POINT-SIZE="10" COLOR="${color('text2')}">${escapeHtml(edge.label)}</FONT>> ` : ''}`
}

function headings() {
  return COLUMNS.map(
    (text, i) =>
      `h${i} [shape=plaintext style="" label=<<FONT FACE="${SANS}" POINT-SIZE="11" COLOR="${color('text2')}"><B>${escapeHtml(text.toUpperCase())}</B></FONT>>];`,
  )
}

function nodeSource(node: Node) {
  return `${node.id} [label=${label(node)} ${nodeSize(node)} ${nodeStyle(node)}];`
}

export function architectureDot(numbers: Numbers) {
  const all = nodes(numbers)
  const order = columns.map(
    (ids, i) => `${[`h${i}`, ...ids].join(' -> ')} [style=invis];`,
  )
  const ranked = columns.map(
    (ids, i) => `{ rank=same; h${i}; ${ids.join('; ')}; }`,
  )
  return `digraph architecture {
  rankdir=LR
  splines=ortho
  nodesep=0.14
  ranksep=0.4
  bgcolor=transparent
  node [shape=box margin="0.12,0.07" fontname="${SANS}"]
  edge [color="${color('text2')}" arrowsize=0.6 penwidth=1.25]
  ${headings().join('\n  ')}
  ${all.map(nodeSource).join('\n  ')}
  ${edges.map(e => `${e.from} -> ${e.to} [${edgeStyle(e)}];`).join('\n  ')}
  ${ranked.join('\n  ')}
  ${order.join('\n  ')}
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

const HEADING = /<title>h\d+<\/title>[\s\S]*?<\/g>/g
const Y = /\by="(-?[\d.]+)"/g

function alignHeadings(svg: string) {
  const blocks = svg.match(HEADING) ?? []
  const top = Math.min(
    ...blocks.flatMap(block =>
      [...block.matchAll(Y)].map(match => Number(match[1])),
    ),
  )
  return blocks.length === 0
    ? fail('no column headings found in the rendered diagram')
    : blocks.reduce(
        (out, block) =>
          out.replace(block, () => block.replace(Y, () => `y="${top}"`)),
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
  return bareSvg(alignHeadings(theme(renderDot(architectureDot(numbers)))))
}
