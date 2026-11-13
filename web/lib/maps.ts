import { LABEL_KEYS, LABELS, axisLabels, esc } from './html.ts'
import type {
  Edit,
  Feature,
  GAlpha,
  Gene,
  GeneVariant,
  IsoformRecord,
} from './types.ts'

const MAP_PARTNERS = 12
const LANE = 13
const CHARACTER_WIDTH = 6
const ALIKE = 0.8
const FOLDED = 70

const SITES = ['Binding site', 'Active site', 'Site']

const FEATURE_ROWS = [
  { label: 'Domains', types: ['Domain', 'Repeat', 'Zinc finger', 'Motif'] },
  { label: 'Regions', types: ['Region', 'Coiled coil'] },
  { label: 'Sites', types: SITES },
]

export function isBindingRegion(feature: Feature) {
  return /interact|bind/i.test(feature.description)
}

function featureKind(feature: Feature) {
  return SITES.includes(feature.type)
    ? 'site'
    : feature.description === 'Disordered'
      ? 'disordered'
      : isBindingRegion(feature)
        ? 'binding'
        : feature.type === 'Region' || feature.type === 'Coiled coil'
          ? 'region'
          : 'domain'
}

function featureName(feature: Feature) {
  return feature.type === 'Repeat' && /^\d+$/.test(feature.description)
    ? `Repeat ${feature.description}`
    : feature.description || feature.type
}

export function lanes<T extends { start: number; end: number }>(items: T[]) {
  const ends: number[] = []
  return items
    .toSorted((a, b) => a.start - b.start || b.end - a.end)
    .map(item => {
      const free = ends.findIndex(end => end < item.start)
      const lane = free === -1 ? ends.length : free
      ends[lane] = item.end
      return { item, lane }
    })
}

export function partnerResidues(partner: { runs: string }) {
  return partner.runs.split(', ').flatMap(run => {
    const [a = 0, b = a] = run.split('–').map(Number)
    return Array.from({ length: b - a + 1 }, (_, k) => a + k)
  })
}

export function pathogenicAtSameResidue(gene: Gene) {
  const pathogenic = Map.groupBy(
    gene.variants.filter(v => v.label === 'pathogenic'),
    v => v.position,
  )
  return new Map(
    gene.variants.flatMap(v => {
      const changes = [
        ...new Set(pathogenic.get(v.position)?.map(p => p.change)),
      ]
      return v.label === 'uncertain' && changes.length ? [[v, changes]] : []
    }),
  )
}

export function variantData(v: GeneVariant, sameResidue: string[] = []) {
  return `data-label="${v.label}" data-conditions="${esc(JSON.stringify(v.conditions))}"${sameResidue.length ? ' data-lead' : ''}${v.partnerDiseases.length ? ' data-partner-disease' : ''}`
}

function overlap(a: Set<number>, b: Set<number>) {
  const shared = [...a].filter(r => b.has(r)).length
  return shared / (a.size + b.size - shared)
}

export function partnerKey(gene: string) {
  return `partner:${gene}`
}

function guide(
  key: string,
  positions: number[],
  scale: (x: number) => number,
  bottom: number,
) {
  const width = Math.max(scale(2) - scale(1), 2)
  const bars = positions.map(
    p =>
      `M${(scale(p) - width / 2).toFixed(2)} 0h${width.toFixed(2)}v${bottom}h-${width.toFixed(2)}z`,
  )
  return `<path class="guide" data-for="${esc(key)}" d="${bars.join('')}" />`
}

export function partnerLabel(partner: { gene: string; homodimer?: boolean }) {
  return partner.homodimer ? 'itself' : partner.gene
}

export function partnerGroups(
  partners: {
    gene: string
    runs: string
    variants: number
    homodimer?: boolean
  }[],
) {
  const groups: { members: typeof partners; residues: Set<number> }[] = []
  for (const partner of partners) {
    const residues = new Set(partnerResidues(partner))
    const alike = partner.homodimer
      ? undefined
      : groups.find(
          g =>
            !g.members.some(m => m.homodimer) &&
            overlap(g.residues, residues) >= ALIKE,
        )
    if (alike) {
      alike.members.push(partner)
    } else {
      groups.push({ members: [partner], residues })
    }
  }
  return groups.map(g => {
    const members = g.members.toSorted((a, b) => b.variants - a.variants)
    return {
      names: members.map(p => p.gene),
      labels: members.map(partnerLabel),
      residues: g.residues,
    }
  })
}

export function partnerTracks(partners: Gene['partners']) {
  const groups = partnerGroups(partners)
  const shown = groups.slice(0, MAP_PARTNERS)
  const rest = groups.slice(MAP_PARTNERS)
  return [
    ...shown.map(g => ({
      label:
        g.labels.length > 1
          ? `${g.labels[0]} +${g.labels.length - 1}`
          : (g.labels[0] ?? ''),
      partner: g.names[0],
      names: g.names,
      labels: g.labels,
      residues: [
        ...new Set(
          partners
            .filter(p => g.names.includes(p.gene))
            .flatMap(partnerResidues),
        ),
      ],
    })),
    ...(rest.length
      ? [
          {
            label: `+${rest.flatMap(g => g.names).length} more`,
            partner: undefined,
            names: rest.flatMap(g => g.names),
            labels: rest.flatMap(g => g.labels),
            residues: [
              ...new Set(
                partners
                  .filter(p => rest.some(g => g.names.includes(p.gene)))
                  .flatMap(partnerResidues),
              ),
            ],
          },
        ]
      : []),
  ]
}

export function proteinMap(gene: Gene) {
  const sameResidue = pathogenicAtSameResidue(gene)
  const width = 1000
  const left = 90
  const scale = (x: number) =>
    left + ((x - 1) / Math.max(gene.length - 1, 1)) * (width - left - 20)
  const tracks = partnerTracks(gene.partners)
  const rows = { pathogenic: 0, uncertain: 14, benign: 28 }
  const featureRows = FEATURE_ROWS.map(row => ({
    label: row.label,
    placed: lanes(gene.features.filter(f => row.types.includes(f.type))),
  }))
    .filter(row => row.placed.length)
    .reduce<
      {
        label: string
        y: number
        height: number
        placed: ReturnType<typeof lanes<Feature>>
      }[]
    >((out, row) => {
      const last = out.at(-1)
      const y = last ? last.y + last.height + 4 : 48
      return [
        ...out,
        {
          ...row,
          y,
          height: (Math.max(...row.placed.map(p => p.lane)) + 1) * LANE,
        },
      ]
    }, [])
  const lastFeatureRow = featureRows.at(-1)
  const top = lastFeatureRow ? lastFeatureRow.y + lastFeatureRow.height + 8 : 48
  const rowHeight = 13
  const axisY = top + tracks.length * rowHeight + 4
  return `
    <div class="map-wrap"><svg class="map protein-map" viewBox="0 0 ${width} ${axisY + 22}" data-first="${scale(1)}" data-last="${scale(gene.length)}" data-length="${gene.length}" role="img" aria-label="Protein map of ${esc(gene.gene)}: variants and each partner's interface residues along ${gene.length} residues">
      ${LABEL_KEYS.map(
        label =>
          `<text class="row-label" x="0" y="${rows[label] + 9}">${LABELS[label]}</text>${gene.variants
            .filter(v => v.label === label)
            .map(
              v =>
                `<rect class="variant-mark" ${variantData(v, sameResidue.get(v))} data-position="${v.position}" x="${scale(v.position) - 1.5}" y="${rows[label]}" width="3" height="10" fill="var(--${label})"><title>${esc(v.change)} ${LABELS[label]}</title></rect>`,
            )
            .join('')}`,
      ).join('')}
      ${featureRows
        .map(
          row =>
            `<text class="row-label" x="0" y="${row.y + 9}">${row.label}</text>${row.placed
              .map(({ item, lane }) => {
                const x = scale(item.start) - 1
                const w = Math.max(scale(item.end) - scale(item.start) + 2, 2)
                const name = featureName(item)
                const range =
                  item.start === item.end
                    ? `${item.start}`
                    : `${item.start}–${item.end}`
                return `<g class="feature ${featureKind(item)}" data-start="${item.start}" data-end="${item.end}"><rect x="${x}" y="${row.y + lane * LANE}" width="${w}" height="11" rx="2" /><title>${esc(name)} (${item.type.toLowerCase()}, ${range})</title>${
                  name.length * CHARACTER_WIDTH < w - 6
                    ? `<text x="${x + 4}" y="${row.y + lane * LANE + 8.5}">${esc(name)}</text>`
                    : ''
                }</g>`
              })
              .join('')}`,
        )
        .join('')}
      ${tracks
        .map((track, index) => {
          const y = top + index * rowHeight
          const names = track.names.join(', ')
          const shown = track.labels.join(', ')
          return `<g class="partner-row"${track.partner ? ` data-partner="${esc(track.partner)}"` : ''} data-names="${esc(names)}" data-guide="track:${index}" data-members="${esc(track.names.map(partnerKey).join(' '))}"><rect class="row-hit" x="0" y="${y - 1.5}" width="${width}" height="${rowHeight}" /><text class="row-label" x="0" y="${y + 9}">${esc(track.label)}<title>${esc(shown)}</title></text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${y + 5}" y2="${y + 5}" />
            ${track.residues.map(r => `<rect x="${scale(r) - 1}" y="${y}" width="2.5" height="10" fill="var(--interface)"><title>residue ${r}: interface with ${esc(shown)}</title></rect>`).join('')}</g>`
        })
        .join('')}
      ${tracks.map((track, index) => guide(`track:${index}`, track.residues, scale, axisY)).join('')}
      ${gene.partners.map(p => guide(partnerKey(p.gene), partnerResidues(p), scale, axisY)).join('')}
      <line class="axis" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${axisY}" y2="${axisY}" />
      <g class="map-cursor" visibility="hidden"><line y1="0" y2="${axisY}" /><text y="${axisY + 16}" text-anchor="middle"></text></g>
      ${axisLabels(gene.length)
        .map(
          x =>
            `<text class="tick" x="${scale(x)}" y="${axisY + 16}" text-anchor="middle">${x}</text>`,
        )
        .join('')}
    </svg></div>
    <div class="legend">
      <span><span class="swatch" style="background:var(--interface)"></span>interface residue, one row per partner, or per group of partners with nearly the same interface residues; hover a row to draw its residues as columns through the variant rows</span>
      ${gene.features.some(f => featureKind(f) === 'binding') ? `<span><span class="swatch feature-swatch binding"></span>UniProt interaction or binding region</span>` : ''}
      ${gene.features.some(f => featureKind(f) === 'site') ? `<span><span class="swatch feature-swatch site"></span>UniProt binding or active site</span>` : ''}
      ${LABEL_KEYS.map(label => `<span><span class="swatch" style="background:var(--${label})"></span>${LABELS[label].toLowerCase()} variant</span>`).join('')}
    </div>`
}

function residueBands(runs: [number, number][]) {
  return runs.flatMap(([band, length]) => Array<number>(length).fill(band))
}

export function editText(edit: Edit) {
  const range =
    edit.start === edit.end ? `${edit.start}` : `${edit.start}–${edit.end}`
  const changed = [...edit.replacement].filter(
    (letter, k) => edit.original?.[k] !== letter,
  ).length
  return !edit.replacement
    ? `${range} missing`
    : edit.original?.length === edit.replacement.length
      ? `${range} replaced, ${changed} of ${edit.replacement.length} residues differ`
      : `${range} replaced by ${edit.replacement.length} aa`
}

function keptShare(x: number, y: number, radius: number, share: number) {
  const angle = 2 * Math.PI * share
  const endX = x + radius * Math.sin(angle)
  const endY = y - radius * Math.cos(angle)
  return share >= 1
    ? `<circle class="kept" cx="${x}" cy="${y}" r="${radius}" />`
    : share > 0
      ? `<path class="kept" d="M${x} ${y}V${y - radius}A${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}z" />`
      : ''
}

export function isoformMap(record: IsoformRecord) {
  const mapWidth = 1000
  const left = 110
  const rowHeight = 22
  const column = 24
  const partners = Object.entries(record.interfaces)
  const headLabel = (partner: string) =>
    partnerLabel({ gene: partner, homodimer: partner === record.gene })
  const interfaceResidues = [
    ...new Set(partners.flatMap(([, positions]) => positions)),
  ].sort((a, b) => a - b)
  const headerHeight = partners.length
    ? Math.max(...partners.map(([partner]) => headLabel(partner).length)) *
        4.6 +
      14
    : 0
  const width =
    mapWidth +
    (partners.length ? 16 + partners.length * column + headerHeight : 0)
  const scale = (x: number) =>
    left + ((x - 1) / Math.max(record.length - 1, 1)) * (mapWidth - left - 20)
  const step = (mapWidth - left - 20) / record.length
  const rows = [
    {
      label: 'Canonical',
      isoform: record.canonical.accession,
      plddt: residueBands(record.canonical.plddt),
      segments: [[1, 1, record.length]],
      edits: [],
      interfaceLost: Object.fromEntries<[number, number]>([]),
    },
    ...record.isoforms.map(i => ({
      label: i.accession,
      isoform: i.accession,
      plddt: residueBands(i.plddt),
      segments: i.segments,
      edits: i.edits,
      interfaceLost: i.interfaceLost,
    })),
  ]
  const kept = (row: (typeof rows)[number]) =>
    new Set(
      row.segments.flatMap(([, canonicalStart = 1, length = 0]) =>
        Array.from({ length }, (_, k) => canonicalStart + k),
      ),
    )
  const bars = (row: (typeof rows)[number], y: number) => {
    const runs: { start: number; end: number; folded: boolean }[] = []
    for (const [isoStart = 1, canonicalStart = 1, length = 0] of row.segments) {
      for (let k = 0; k < length; k++) {
        const folded = (row.plddt[isoStart - 1 + k] ?? 0) >= FOLDED
        const last = runs.at(-1)
        if (
          last &&
          last.folded === folded &&
          last.end === canonicalStart + k - 1
        ) {
          last.end += 1
        } else {
          runs.push({
            start: canonicalStart + k,
            end: canonicalStart + k,
            folded,
          })
        }
      }
    }
    return runs
      .map(
        r =>
          `<rect class="${r.folded ? 'folded' : 'loose'}" x="${scale(r.start) - step / 2}" y="${y}" width="${(r.end - r.start + 1) * step}" height="12" />`,
      )
      .join('')
  }
  const interfaceTicks = (row: (typeof rows)[number], y: number) => {
    const present = kept(row)
    return interfaceResidues
      .filter(x => present.has(x))
      .map(
        x =>
          `<rect class="interface-tick" x="${scale(x) - 1}" y="${y + 3}" width="2.5" height="6" />`,
      )
      .join('')
  }
  const replaced = (row: (typeof rows)[number], y: number) =>
    row.edits
      .filter(e => e.replacement)
      .map(
        e =>
          `<rect class="replaced" x="${scale(e.start) - step / 2}" y="${y - 2}" width="${(e.end - e.start + 1) * step}" height="16"><title>${esc(editText(e))}: ${esc(e.replacement)}</title></rect>`,
      )
      .join('')
  const dots = (row: (typeof rows)[number], y: number) =>
    partners
      .map(([partner, positions], index) => {
        const [lost = 0, total = positions.length] =
          row.interfaceLost[partner] ?? []
        const x = mapWidth + 16 + index * column + column / 2
        return `<g class="partner-dot" data-guide="${esc(partnerKey(partner))}"><title>${esc(row.label)} keeps ${total - lost} of ${total} ${esc(headLabel(partner))} interface residues</title><circle class="dot-ring" cx="${x}" cy="${y + 6}" r="7" />${keptShare(x, y + 6, 7, (total - lost) / total)}</g>`
      })
      .join('')
  const marks = [
    {
      key: 'pathogenic',
      label: 'ClinVar pathogenic',
      hint: 'ClinVar pathogenic',
      positions: record.pathogenic ?? [],
      color: 'var(--pathogenic)',
      title: 'pathogenic missense at residue',
    },
    {
      key: 'interface',
      label: 'Partner interface',
      hint: 'partner interface',
      positions: interfaceResidues,
      color: 'var(--interface)',
      title: 'predicted interface residue',
    },
  ].filter(m => m.positions.length)
  const ticks = (m: (typeof marks)[number], y: number) =>
    m.positions
      .map(
        x =>
          `<rect x="${scale(x) - 1}" y="${y}" width="2.5" height="9" fill="${m.color}"><title>${m.title} ${x}</title></rect>`,
      )
      .join('')
  const top = Math.max(marks.length * 17 + 8, headerHeight)
  const height = top + rows.length * rowHeight + 24
  const axisY = top + rows.length * rowHeight + 4
  const headers = partners
    .map(([partner], index) => {
      const x = mapWidth + 16 + index * column + column / 2
      return `<g class="map-row partner-head" data-guide="${esc(partnerKey(partner))}"><rect class="row-hit" x="${x - column / 2}" y="0" width="${column}" height="${height - 24}" /><text class="row-label" transform="translate(${x + 3} ${top - 8}) rotate(-45)">${esc(headLabel(partner))}</text></g>`
    })
    .join('')
  return `
    <div class="map-wrap"><svg class="map" style="min-width:${Math.round(width * 0.76)}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(record.gene)} isoforms aligned to the canonical protein, with the share of each partner's interface residues each isoform keeps">
      ${marks.map((m, index) => `<g class="map-row" data-guide="${m.key}"><rect class="row-hit" x="0" y="${index * 17 - 3}" width="${mapWidth}" height="15" /><text class="row-label" x="0" y="${index * 17 + 9}">${m.label}</text>${ticks(m, index * 17)}</g>`).join('')}
      ${headers}
      ${rows
        .map((row, index) => {
          const y = top + index * rowHeight
          return `<g class="map-row" data-isoform="${esc(row.isoform)}"><rect class="row-hit" x="0" y="${y - 4}" width="${mapWidth}" height="${rowHeight - 2}" /><text class="row-label" x="0" y="${y + 10}">${esc(row.label)}</text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(record.length)}" y1="${y + 6}" y2="${y + 6}" />
            ${bars(row, y)}${interfaceTicks(row, y)}${replaced(row, y)}${dots(row, y)}</g>`
        })
        .join('')}
      ${marks.map(m => guide(m.key, m.positions, scale, axisY)).join('')}
      ${partners.map(([partner, positions]) => guide(partnerKey(partner), positions, scale, axisY)).join('')}
      <line class="axis" x1="${scale(1)}" x2="${scale(record.length)}" y1="${axisY}" y2="${axisY}" />
      ${axisLabels(record.length)
        .map(
          x =>
            `<text class="tick" x="${scale(x)}" y="${axisY + 16}" text-anchor="middle">${x}</text>`,
        )
        .join('')}
    </svg></div>
    <div class="legend">
      <span><span class="swatch folded-swatch"></span>folded (pLDDT ≥ ${FOLDED})</span>
      <span><span class="swatch loose-swatch"></span>pLDDT &lt; ${FOLDED}</span>
      <span>gap: missing from the isoform</span>
      <span><span class="swatch replaced-swatch"></span>replaced in the isoform</span>
      ${interfaceResidues.length ? `<span><span class="swatch" style="background:var(--interface)"></span>interface residue the isoform keeps</span>` : ''}
      ${partners.length ? `<span><span class="dot-swatch"></span>share of a partner's interface residues kept</span>` : ''}
      ${marks.length ? `<span class="muted">Hover ${[...marks.map(m => `<span class="hover-hint" data-guide="${m.key}">${m.hint}</span>`), ...(partners.length ? ['a partner'] : [])].join(' or ')} to run its residues down every isoform.</span>` : ''}
    </div>`
}

function cgnPart(part: string) {
  return `${part.toLowerCase().startsWith('h') ? 'α' : 'β'}${part.slice(1).toUpperCase()}`
}

export function cgnName(segment: string) {
  const loop = /^([hs](?:\d+|[a-z]))([hs](?:\d+|[a-z]))$/.exec(segment)
  return loop
    ? `${cgnPart(loop[1] ?? '')}–${cgnPart(loop[2] ?? '')} loop`
    : cgnPart(segment)
}

export function cgnElements(labels: Record<string, string>) {
  const elements = new Array<{ name: string; start: number; end: number }>()
  for (const [position, label] of Object.entries(labels)
    .map(([p, l]) => [Number(p), l] as const)
    .sort(([a], [b]) => a - b)) {
    const name = label.split('.')[1] ?? ''
    const last = elements.at(-1)
    if (/^[A-Z]/.test(name)) {
      if (last?.name === name && last.end === position - 1) {
        last.end = position
      } else {
        elements.push({ name, start: position, end: position })
      }
    }
  }
  return elements
}

export function surfaceMap(g: GAlpha, labels: Record<string, string> = {}) {
  const width = 1000
  const scale = (x: number) =>
    20 + ((x - 1) / Math.max(g.length - 1, 1)) * (width - 40)
  const most = Math.max(...g.counts.map(([, n]) => n))
  const marks = g.variants.filter(v => v.label !== 'benign')
  const elements = cgnElements(labels)
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} ${elements.length ? 96 : 76}" role="img" aria-label="${esc(g.gene)} residues contacting a receptor, by number of structures">
      ${marks.map(v => `<rect x="${scale(v.position) - 1.5}" y="0" width="3" height="9" fill="var(--${v.label})"><title>${esc(v.change)} ${LABELS[v.label]}</title></rect>`).join('')}
      ${g.counts.map(([r, n]) => `<rect x="${scale(r) - 1.25}" y="${46 - (30 * n) / most}" width="2.5" height="${(30 * n) / most}" fill="var(--interface)"><title>residue ${r}: contacts the receptor in ${n} of ${g.structures} structures</title></rect>`).join('')}
      <line class="axis" x1="20" x2="${width - 20}" y1="48" y2="48" />
      ${[1, Math.round(g.length / 4), Math.round(g.length / 2), Math.round((3 * g.length) / 4), g.length].map(x => `<text class="tick" x="${scale(x)}" y="66" text-anchor="middle">${x}</text>`).join('')}
      ${elements.map(e => `<rect x="${scale(e.start) - 1}" y="74" width="${scale(e.end) - scale(e.start) + 2}" height="${e.name.startsWith('S') ? 4 : 8}" fill="var(--chain)"><title>${esc(e.name)} (CGN), residues ${e.start}–${e.end}</title></rect>${e.name.startsWith('H') && e.end - e.start >= 8 ? `<text class="tick" x="${(scale(e.start) + scale(e.end)) / 2}" y="94" text-anchor="middle">${cgnName(e.name)}</text>` : ''}`).join('')}
    </svg></div>`
}
