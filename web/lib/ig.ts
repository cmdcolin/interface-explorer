import { igIsoforms } from './data.ts'
import { axisLabels, esc } from './html.ts'
import type { IgDomain, IgRecord } from './types.ts'

const WIDTH = 1000
const LEFT = 190
const ROW = 30
const EPITOPE_ROW = 20

type Span = [number, number]

interface Epitope {
  label: string
  domains: number[]
}

const EPITOPES: Record<string, Epitope[]> = {
  CD33: [{ label: 'gemtuzumab, P67.6', domains: [0] }],
  CD22: [
    { label: 'epratuzumab', domains: [1, 2] },
    { label: 'inotuzumab', domains: [0] },
    { label: 'HA22 CAR', domains: [2] },
    { label: 'm971', domains: [6] },
  ],
}

function remaining(domain: IgDomain, removed: Span[]) {
  return removed
    .toSorted(([a], [b]) => a - b)
    .reduce<Span[]>(
      (pieces, [start, end]) =>
        pieces.flatMap(([from, to]): Span[] =>
          end < from || start > to
            ? [[from, to]]
            : [
                ...(start > from ? [[from, start - 1] satisfies Span] : []),
                ...(end < to ? [[end + 1, to] satisfies Span] : []),
              ],
        ),
      [[domain.start, domain.end]],
    )
}

function domainLabel(domain: IgDomain, index: number) {
  return `${index + 1} ${domain.name.replace('Ig-like ', '').split('-')[0]}`
}

export function igMap(record: IgRecord) {
  const scale = (x: number) => LEFT + (x / record.length) * (WIDTH - LEFT - 20)
  const width = (from: number, to: number) => scale(to + 1) - scale(from)
  const epitopes = EPITOPES[record.gene] ?? []
  const rows = [
    {
      label: record.accession,
      removed: [] as Span[],
      lost: [] as number[],
    },
    ...record.isoforms
      .filter(i => i.lost.length > 0)
      .map(i => ({
        label: `${i.accession} (${i.name})`,
        removed: i.removed,
        lost: i.lost,
      })),
  ]
  const labelsY = 14
  const epitopesY = labelsY + 12
  const top = epitopesY + epitopes.length * EPITOPE_ROW + 6
  const height = top + rows.length * ROW + 30
  const axisY = top + rows.length * ROW
  const epitopeBars = epitopes
    .map((epitope, index) => {
      const first = record.domains[Math.min(...epitope.domains)]
      const last = record.domains[Math.max(...epitope.domains)]
      const y = epitopesY + index * EPITOPE_ROW
      return first && last
        ? `<g class="map-row"><text class="row-label" x="0" y="${y + 11}">${esc(epitope.label)}</text><rect x="${scale(first.start).toFixed(1)}" y="${y + 2}" width="${width(first.start, last.end).toFixed(1)}" height="9" rx="2" fill="var(--pathogenic)"><title>${esc(epitope.label)} binds domain${epitope.domains.length > 1 ? 's' : ''} ${epitope.domains.map(d => d + 1).join('–')}</title></rect></g>`
        : ''
    })
    .join('')
  return `
    <div class="map-wrap"><svg class="map" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${esc(record.gene)} isoforms that lack Ig-like domains, aligned to the canonical protein, under the domains each antibody binds">
      ${record.domains
        .map(
          (domain, index) =>
            `<text class="tick" x="${scale((domain.start + domain.end) / 2).toFixed(1)}" y="${labelsY}" text-anchor="middle">${esc(domainLabel(domain, index))}</text>`,
        )
        .join('')}
      ${epitopeBars}
      ${rows
        .map((row, index) => {
          const y = top + index * ROW
          return `<g class="map-row"><text class="row-label" x="0" y="${y + 14}">${esc(row.label)}</text>
            <line class="baseline" x1="${scale(0)}" x2="${scale(record.length)}" y1="${y + 10}" y2="${y + 10}" />
            ${record.domains
              .map((domain, d) =>
                [
                  ...remaining(domain, row.removed).map(
                    ([from, to]) =>
                      `<rect x="${scale(from).toFixed(1)}" y="${y}" width="${width(from, to).toFixed(1)}" height="20" rx="3" fill="var(--interface)"><title>${esc(domain.name)} ${domain.start}–${domain.end}</title></rect>`,
                  ),
                  row.lost.includes(d)
                    ? `<rect class="replaced" x="${scale(domain.start).toFixed(1)}" y="${y}" width="${width(domain.start, domain.end).toFixed(1)}" height="20" rx="3"><title>${esc(domain.name)} ${domain.start}–${domain.end}: missing</title></rect>`
                    : '',
                ].join(''),
              )
              .join('')}
          </g>`
        })
        .join('')}
      <line class="axis" x1="${scale(0)}" x2="${scale(record.length)}" y1="${axisY + 4}" y2="${axisY + 4}" />
      ${axisLabels(record.length)
        .map(
          x =>
            `<text class="tick" x="${scale(x)}" y="${axisY + 20}" text-anchor="middle">${x}</text>`,
        )
        .join('')}
    </svg></div>
    <div class="legend">
      <span><span class="swatch" style="background:var(--interface)"></span>Ig-like domain, numbered from the N-terminus</span>
      <span>dashed box: domain skipped by splicing</span>
      ${epitopes.length ? `<span><span class="swatch" style="background:var(--pathogenic)"></span>domains the antibody binds</span>` : ''}
    </div>`
}

function recordOf(gene: string) {
  return igIsoforms().records.find(r => r.gene === gene)
}

export function igCase(gene: string) {
  const record = recordOf(gene)
  return record ? igMap(record) : ''
}

export function igTotals() {
  const { genes, genesLosingDomain, isoformsLosingDomain } = igIsoforms()
  return { genes, genesLosingDomain, isoformsLosingDomain }
}

export function igFacts(gene: string) {
  const record = recordOf(gene)
  return {
    domains: record?.domains.length ?? 0,
    isoforms: (record?.isoforms ?? [])
      .filter(i => i.lost.length > 0)
      .map(i => ({
        accession: i.accession,
        name: i.name,
        lost: i.lost.map(d => d + 1),
      })),
  }
}

export function igGenes() {
  return igIsoforms().records.map(r => ({
    gene: r.gene,
    accession: r.accession,
    isoforms: r.isoforms.filter(i => i.lost.length > 0).length,
  }))
}

export function spliceDiagram() {
  const exons = [
    { name: 'exon 4', x: 170 },
    { name: 'exon 5', x: 360 },
    { name: 'exon 6', x: 550 },
    { name: 'exon 7', x: 740 },
  ]
  const boxWidth = 120
  const boxHeight = 40
  const rows = { gene: 62, full: 172, spliced: 282 }
  const [first, second, third, fourth] = exons
  const box = (x: number, y: number, name: string, kind: string) =>
    `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" class="${kind}"/><text x="${x + boxWidth / 2}" y="${y + 25}" text-anchor="middle" class="${kind === 'ghost' ? 'splice-ghost-text' : 'splice-text'}">${name}</text>`
  const caret = (fromX: number, toX: number, y: number, peak: number) =>
    `<path d="M${fromX} ${y} L${(fromX + toX) / 2} ${peak} L${toX} ${y}" class="splice-line"/>`
  const kind = (name: string) =>
    name === 'exon 5' || name === 'exon 6' ? 'skipped' : 'kept'
  const gaps = exons.slice(0, -1).map((exon, index) => ({
    from: exon.x + boxWidth,
    to: exons[index + 1]?.x ?? 0,
  }))
  return `
    <div class="map-wrap"><svg class="map splice" viewBox="0 0 1000 350" role="img" aria-label="How splicing skips exons 5 and 6 of the CD22 gene: in the full-length mRNA every exon is joined to the next, in the spliced mRNA exon 4 is joined straight to exon 7">
      <style>
        .splice .kept { fill: var(--interface); }
        .splice .skipped { fill: var(--uncertain); }
        .splice .ghost { fill: none; stroke: var(--benign); stroke-width: 2; stroke-dasharray: 6 5; }
        .splice .splice-text { fill: #fff; font-size: 14px; }
        .splice .splice-ghost-text { fill: var(--text-2); font-size: 14px; }
        .splice .splice-line { fill: none; stroke: var(--text-2); stroke-width: 2; }
        .splice .label { fill: var(--text); font-size: 15px; }
        .splice .note { fill: var(--text-2); font-size: 14px; }
        .splice .intron { stroke: var(--text-2); stroke-width: 2; }
      </style>
      <text class="label" x="0" y="${rows.gene + 25}">Gene (DNA)</text>
      <line class="intron" x1="${(first?.x ?? 0) - 40}" x2="${(fourth?.x ?? 0) + boxWidth + 40}" y1="${rows.gene + 20}" y2="${rows.gene + 20}"/>
      ${exons.map(e => box(e.x, rows.gene, e.name, kind(e.name))).join('')}
      <path d="M${second?.x ?? 0} ${rows.gene - 12} v-8 H${(third?.x ?? 0) + boxWidth} v8" class="splice-line"/>
      <text class="note" x="${((second?.x ?? 0) + (third?.x ?? 0) + boxWidth) / 2}" y="${rows.gene - 30}" text-anchor="middle">exons 5 and 6 encode domains 3 and 4</text>
      <text class="label" x="0" y="${rows.full + 25}">Full-length mRNA</text>
      ${exons.map(e => box(e.x, rows.full, e.name, kind(e.name))).join('')}
      ${gaps.map(g => caret(g.from, g.to, rows.full, rows.full - 22)).join('')}
      <text class="label" x="0" y="${rows.spliced + 25}">Spliced mRNA</text>
      ${exons.map(e => (kind(e.name) === 'skipped' ? box(e.x, rows.spliced, e.name, 'ghost') : box(e.x, rows.spliced, e.name, 'kept'))).join('')}
      ${caret((first?.x ?? 0) + boxWidth, fourth?.x ?? 0, rows.spliced, rows.spliced - 52)}
      <text class="note" x="${((second?.x ?? 0) + (third?.x ?? 0) + boxWidth) / 2}" y="${rows.spliced + 66}" text-anchor="middle">exons 5 and 6 skipped, so domains 3 and 4 are never built</text>
    </svg></div>`
}
