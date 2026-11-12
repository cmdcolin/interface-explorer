import { LABEL_KEYS, LABELS, axisLabels, esc } from './html.ts'
import type { Edit, GAlpha, Gene, IsoformRecord } from './types.ts'

const MAP_PARTNERS = 12

function partnerResidues(partner: { runs: string }) {
  return partner.runs.split(', ').flatMap(run => {
    const [a = 0, b = a] = run.split('–').map(Number)
    return Array.from({ length: b - a + 1 }, (_, k) => a + k)
  })
}

export function variantData(v: { label: string; conditions: string[] }) {
  return `data-label="${v.label}" data-conditions="${esc(JSON.stringify(v.conditions))}"`
}

export function proteinMap(gene: Gene) {
  const width = 1000
  const left = 90
  const scale = (x: number) =>
    left + ((x - 1) / Math.max(gene.length - 1, 1)) * (width - left - 20)
  const rest = gene.partners.slice(MAP_PARTNERS)
  const tracks = [
    ...gene.partners
      .slice(0, MAP_PARTNERS)
      .map(p => ({ label: p.gene, residues: partnerResidues(p) })),
    ...(rest.length
      ? [
          {
            label: `+${rest.length} more`,
            residues: [...new Set(rest.flatMap(partnerResidues))],
          },
        ]
      : []),
  ]
  const rows = { pathogenic: 0, uncertain: 14, benign: 28 }
  const top = 48
  const rowHeight = 13
  const axisY = top + tracks.length * rowHeight + 4
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${width} ${axisY + 22}" role="img" aria-label="Protein map of ${esc(gene.gene)}: variants and each partner's interface residues along ${gene.length} residues">
      ${LABEL_KEYS.map(
        label =>
          `<text class="row-label" x="0" y="${rows[label] + 9}">${LABELS[label]}</text>${gene.variants
            .filter(v => v.label === label)
            .map(
              v =>
                `<rect class="variant-mark" ${variantData(v)} x="${scale(v.position) - 1.5}" y="${rows[label]}" width="3" height="10" fill="var(--${label})"><title>${esc(v.change)} ${LABELS[label]}</title></rect>`,
            )
            .join('')}`,
      ).join('')}
      ${tracks
        .map((track, index) => {
          const y = top + index * rowHeight
          return `<text class="row-label" x="0" y="${y + 9}">${esc(track.label)}</text>
            <line class="baseline" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${y + 5}" y2="${y + 5}" />
            ${track.residues.map(r => `<rect x="${scale(r) - 1}" y="${y}" width="2.5" height="10" fill="var(--interface)"><title>residue ${r}: interface with ${esc(track.label)}</title></rect>`).join('')}`
        })
        .join('')}
      <line class="axis" x1="${scale(1)}" x2="${scale(gene.length)}" y1="${axisY}" y2="${axisY}" />
      ${axisLabels(gene.length)
        .map(
          x =>
            `<text class="tick" x="${scale(x)}" y="${axisY + 16}" text-anchor="middle">${x}</text>`,
        )
        .join('')}
    </svg></div>
    <div class="legend">
      <span><span class="swatch" style="background:var(--interface)"></span>interface residue, one row per partner</span>
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
