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
      signalTruncated: false,
    },
    ...record.isoforms
      .filter(i => i.lost.length > 0)
      .map(i => ({
        label: `${i.accession} (${i.name})`,
        removed: i.removed,
        lost: i.lost,
        signalTruncated: i.signalTruncated,
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
          const note = row.signalTruncated
            ? ' †<title>Its deletion also removes the signal peptide, so this product may never reach the cell surface</title>'
            : ''
          return `<g class="map-row"><text class="row-label" x="0" y="${y + 14}">${esc(row.label)}${note}</text>
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
      ${rows.some(r => r.signalTruncated) ? `<span>† the deletion also removes the signal peptide, so the protein may never reach the cell surface</span>` : ''}
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
  const {
    genes,
    genesLosingDomain,
    isoformsLosingDomain,
    isoformsTruncatingSignal,
    genesTruncatingSignal,
  } = igIsoforms()
  return {
    genes,
    genesLosingDomain,
    isoformsLosingDomain,
    isoformsTruncatingSignal,
    genesTruncatingSignal,
    isoformsKeepingSignal: isoformsLosingDomain - isoformsTruncatingSignal,
  }
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
        signalTruncated: i.signalTruncated,
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
    { label: '', x: 170, skipped: false },
    { label: '5', x: 360, skipped: true },
    { label: '6', x: 550, skipped: true },
    { label: '', x: 740, skipped: false },
  ]
  const boxWidth = 120
  const boxHeight = 40
  const rows = {
    gene: 20,
    full: 110,
    fullProtein: 190,
    spliced: 270,
    splicedProtein: 350,
  }
  const [first, , , fourth] = exons
  const box = (x: number, y: number, label: string, kind: string) =>
    `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" class="${kind}"/><text x="${x + boxWidth / 2}" y="${y + 27}" text-anchor="middle" class="${kind === 'ghost' ? 'splice-ghost-text' : 'splice-text'}">${label}</text>`
  const caret = (fromX: number, toX: number, y: number, peak: number) =>
    `<path d="M${fromX} ${y} L${(fromX + toX) / 2} ${peak} L${toX} ${y}" class="splice-line"/>`
  const gaps = exons.slice(0, -1).map((exon, index) => ({
    from: exon.x + boxWidth,
    to: exons[index + 1]?.x ?? 0,
  }))
  const brick = 64
  const protein = (y: number, lost: boolean) =>
    Array.from({ length: 7 }, (_, index) => {
      const x = 267 + index * (brick + 8)
      const domain = index + 1
      const spliced = domain === 3 || domain === 4
      return `<rect x="${x}" y="${y}" width="${brick}" height="30" rx="6" class="${spliced ? (lost ? 'ghost' : 'skipped') : 'kept'}"/>${spliced ? `<text x="${x + brick / 2}" y="${y + 21}" text-anchor="middle" class="${lost ? 'splice-ghost-text' : 'splice-text'}">${domain}</text>` : ''}`
    }).join('')
  const arrow = (y: number) =>
    `<path d="M515 ${y} V${y + 22} m-6 -8 l6 8 l6 -8" class="splice-line"/>`
  return `
    <div class="map-wrap"><svg class="map splice" viewBox="0 0 1000 420" role="img" aria-label="Splicing can skip exons 5 and 6 of the CD22 gene. The full-length mRNA joins every exon and gives a protein with seven domains. The spliced mRNA skips exons 5 and 6 and gives a protein without domains 3 and 4">
      <style>
        .splice .kept { fill: var(--interface); }
        .splice .skipped { fill: var(--uncertain); }
        .splice .ghost { fill: none; stroke: var(--benign); stroke-width: 2; stroke-dasharray: 6 5; }
        .splice .splice-text { fill: #fff; font-size: 17px; }
        .splice .splice-ghost-text { fill: var(--text-2); font-size: 17px; }
        .splice .splice-line { fill: none; stroke: var(--text-2); stroke-width: 2; }
        .splice .label { fill: var(--text); font-size: 17px; }
        .splice .intron { stroke: var(--text-2); stroke-width: 2; }
      </style>
      <text class="label" x="0" y="${rows.gene + 27}">Gene</text>
      <line class="intron" x1="${(first?.x ?? 0) - 40}" x2="${(fourth?.x ?? 0) + boxWidth + 40}" y1="${rows.gene + 20}" y2="${rows.gene + 20}"/>
      ${exons.map(e => box(e.x, rows.gene, e.label, e.skipped ? 'skipped' : 'kept')).join('')}
      <text class="label" x="0" y="${rows.full + 27}">Full length</text>
      ${exons.map(e => box(e.x, rows.full, e.label, e.skipped ? 'skipped' : 'kept')).join('')}
      ${gaps.map(g => caret(g.from, g.to, rows.full, rows.full - 20)).join('')}
      ${arrow(rows.full + boxHeight + 6)}
      ${protein(rows.fullProtein, false)}
      <text class="label" x="0" y="${rows.spliced + 27}">Spliced</text>
      ${exons.map(e => (e.skipped ? box(e.x, rows.spliced, e.label, 'ghost') : box(e.x, rows.spliced, e.label, 'kept'))).join('')}
      ${caret((first?.x ?? 0) + boxWidth, fourth?.x ?? 0, rows.spliced, rows.spliced - 40)}
      ${arrow(rows.spliced + boxHeight + 6)}
      ${protein(rows.splicedProtein, true)}
    </svg></div>`
}
