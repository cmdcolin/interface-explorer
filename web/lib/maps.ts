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

const FEATURE_ROWS = [
  { label: 'Domains', types: ['Domain', 'Repeat', 'Zinc finger', 'Motif'] },
  { label: 'Regions', types: ['Region', 'Coiled coil'] },
]

export function isBindingRegion(feature: Feature) {
  return /interact|bind/i.test(feature.description)
}

function featureKind(feature: Feature) {
  return feature.description === 'Disordered'
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
  return `data-label="${v.label}" data-conditions="${esc(JSON.stringify(v.conditions))}"${sameResidue.length ? ' data-lead' : ''}`
}

function overlap(a: Set<number>, b: Set<number>) {
  const shared = [...a].filter(r => b.has(r)).length
  return shared / (a.size + b.size - shared)
}

export function partnerLabel(partner: { gene: string; homodimer?: boolean }) {
  return partner.homodimer ? 'itself' : partner.gene
}

export function partnerGroups(partners: { gene: string; runs: string; variants: number; homodimer?: boolean }[]) {
  const groups: { members: typeof partners; residues: Set<number> }[] = []
  for (const partner of partners) {
    const residues = new Set(partnerResidues(partner))
    const alike = partner.homodimer
      ? undefined
      : groups.find(g => !g.members.some(m => m.homodimer) && overlap(g.residues, residues) >= ALIKE)
    if (alike) {
      alike.members.push(partner)
    } else {
      groups.push({ members: [partner], residues })
    }
  }
  return groups.map(g => {
    const members = g.members.toSorted((a, b) => b.variants - a.variants)
    return { names: members.map(p => p.gene), labels: members.map(partnerLabel), residues: g.residues }
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
          return `<g class="partner-row"${track.partner ? ` data-partner="${esc(track.partner)}"` : ''} data-names="${esc(names)}"><rect class="row-hit" x="0" y="${y - 1.5}" width="${width}" height="${rowHeight}" /><text class="row-label" x="0" y="${y + 9}">${esc(track.label)}<title>${esc(shown)}</title></text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${y + 5}" y2="${y + 5}" />
            ${track.residues.map(r => `<rect x="${scale(r) - 1}" y="${y}" width="2.5" height="10" fill="var(--interface)"><title>residue ${r}: interface with ${esc(shown)}</title></rect>`).join('')}</g>`
        })
        .join('')}
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
      <span><span class="swatch" style="background:var(--interface)"></span>interface residue, one row per partner, or per group of partners touching nearly the same residues</span>
      ${gene.features.length ? `<span><span class="swatch feature-swatch binding"></span>UniProt interaction or binding region</span>` : ''}
      ${LABEL_KEYS.map(label => `<span><span class="swatch" style="background:var(--${label})"></span>${LABELS[label].toLowerCase()} variant</span>`).join('')}
    </div>`
}

const PLDDT_BANDS: [number, string, string][] = [
  [90, 'var(--plddt-very-high)', 'very high (≥ 90)'],
  [70, 'var(--plddt-confident)', 'confident (70–90)'],
  [50, 'var(--plddt-low)', 'low (50–70)'],
  [0, 'var(--plddt-very-low)', 'very low (< 50)'],
]

function plddtColor(score: number | undefined) {
  return (
    PLDDT_BANDS.find(([min]) => (score ?? 0) >= min)?.[1] ??
    'var(--plddt-very-low)'
  )
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

export function isoformMap(record: IsoformRecord) {
  const width = 1000
  const left = 110
  const rowHeight = 22
  const scale = (x: number) =>
    left + ((x - 1) / Math.max(record.length - 1, 1)) * (width - left - 20)
  const step = (width - left - 20) / record.length
  const rows = [
    {
      label: 'Canonical',
      plddt: residueBands(record.canonical.plddt),
      segments: [[1, 1, record.length]],
      edits: [],
    },
    ...record.isoforms.map(i => ({
      label: i.accession,
      plddt: residueBands(i.plddt),
      segments: i.segments,
      edits: i.edits,
    })),
  ]
  const bars = (row: (typeof rows)[number], y: number) => {
    const runs: { start: number; end: number; color: string }[] = []
    for (const [isoStart = 1, canonicalStart = 1, length = 0] of row.segments) {
      for (let k = 0; k < length; k++) {
        const color = plddtColor(row.plddt[isoStart - 1 + k])
        const last = runs.at(-1)
        if (
          last &&
          last.color === color &&
          last.end === canonicalStart + k - 1
        ) {
          last.end += 1
        } else {
          runs.push({
            start: canonicalStart + k,
            end: canonicalStart + k,
            color,
          })
        }
      }
    }
    return runs
      .map(
        r =>
          `<rect x="${scale(r.start) - step / 2}" y="${y}" width="${(r.end - r.start + 1) * step}" height="12" fill="${r.color}" />`,
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
  const marks = [
    {
      label: 'ClinVar pathogenic',
      positions: record.pathogenic ?? [],
      color: 'var(--pathogenic)',
      title: 'pathogenic missense at residue',
    },
    {
      label: 'Partner interface',
      positions: record.interface ?? [],
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
  const top = marks.length * 17 + 8
  const height = top + rows.length * rowHeight + 24
  const axisY = top + rows.length * rowHeight + 4
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(record.gene)} isoforms aligned to the canonical protein, colored by AlphaFold pLDDT">
      ${marks.map((m, index) => `<text class="row-label" x="0" y="${index * 17 + 9}">${m.label}</text>${ticks(m, index * 17)}`).join('')}
      ${rows
        .map((row, index) => {
          const y = top + index * rowHeight
          return `<text class="row-label" x="0" y="${y + 10}">${esc(row.label)}</text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(record.length)}" y1="${y + 6}" y2="${y + 6}" />
            ${bars(row, y)}${replaced(row, y)}`
        })
        .join('')}
      <line class="axis" x1="${scale(1)}" x2="${scale(record.length)}" y1="${axisY}" y2="${axisY}" />
      ${axisLabels(record.length)
        .map(
          x =>
            `<text class="tick" x="${scale(x)}" y="${axisY + 16}" text-anchor="middle">${x}</text>`,
        )
        .join('')}
    </svg></div>
    <div class="legend">
      ${PLDDT_BANDS.map(([, color, label]) => `<span><span class="swatch" style="background:${color}"></span>pLDDT ${label}</span>`).join('')}
      <span><span class="swatch replaced-swatch"></span>replaced in the isoform</span>
      <span>gap: missing from the isoform</span>
    </div>`
}

export function surfaceMap(g: GAlpha) {
  const width = 1000
  const scale = (x: number) =>
    20 + ((x - 1) / Math.max(g.length - 1, 1)) * (width - 40)
  const most = Math.max(...g.counts.map(([, n]) => n))
  const marks = g.variants.filter(v => v.label !== 'benign')
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} 76" role="img" aria-label="${esc(g.gene)} residues contacting a receptor, by number of structures">
      ${marks.map(v => `<rect x="${scale(v.position) - 1.5}" y="0" width="3" height="9" fill="var(--${v.label})"><title>${esc(v.change)} ${LABELS[v.label]}</title></rect>`).join('')}
      ${g.counts.map(([r, n]) => `<rect x="${scale(r) - 1.25}" y="${46 - (30 * n) / most}" width="2.5" height="${(30 * n) / most}" fill="var(--interface)"><title>residue ${r}: contacts the receptor in ${n} of ${g.structures} structures</title></rect>`).join('')}
      <line class="axis" x1="20" x2="${width - 20}" y1="48" y2="48" />
      ${[1, Math.round(g.length / 4), Math.round(g.length / 2), Math.round((3 * g.length) / 4), g.length].map(x => `<text class="tick" x="${scale(x)}" y="66" text-anchor="middle">${x}</text>`).join('')}
    </svg></div>`
}
