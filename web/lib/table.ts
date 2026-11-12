import { esc } from './html.ts'

export interface Column<Row> {
  label: string
  num?: boolean
  cell: (row: Row) => string | number
  sort: (row: Row) => string | number
}

export function sortableTable<Row>({
  id,
  rows,
  columns,
  sortBy,
  noun,
  placeholder,
  search,
}: {
  id: string
  rows: Row[]
  columns: Column<Row>[]
  sortBy: number
  noun: string
  placeholder: string
  search: (row: Row) => string[]
}) {
  const key = columns[sortBy]?.sort ?? (() => 0)
  const sorted = rows.toSorted((a, b) => {
    const [x, y] = [key(a), key(b)]
    return x < y ? 1 : x > y ? -1 : 0
  })
  return `
    <div class="toolbar">
      <input type="search" data-filter="${id}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" />
      <span class="muted" data-count="${id}">${rows.length} of ${rows.length} ${esc(noun)}</span>
    </div>
    <div class="table-wrap"><table class="sortable" id="${id}" data-noun="${esc(noun)}" data-sorted="${sortBy}">
      <thead><tr>${columns
        .map(
          (c, index) =>
            `<th class="${c.num ? 'num' : ''}"${c.num ? ' data-num' : ''}><button data-col="${index}">${esc(c.label)}</button></th>`,
        )
        .join('')}</tr></thead>
      <tbody>${sorted
        .map(
          row =>
            `<tr data-search="${esc(search(row).join(' ').toUpperCase())}">${columns
              .map(
                c =>
                  `<td class="${c.num ? 'num' : ''}" data-sort="${esc(c.sort(row))}">${c.cell(row)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tbody>
    </table></div>`
}
