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
      <span>dashed box: domain the isoform lacks</span>
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
