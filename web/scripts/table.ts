function sortValue(row: HTMLTableRowElement, column: number) {
  const value = row.cells[column]?.dataset.sort ?? ''
  const number = Number(value)
  return value !== '' && Number.isFinite(number) ? number : value
}

function wire(table: HTMLTableElement) {
  const body = table.tBodies[0]
  const filter = document.querySelector<HTMLInputElement>(
    `[data-filter="${table.id}"]`,
  )
  const count = document.querySelector(`[data-count="${table.id}"]`)
  const headers = [...table.querySelectorAll('th')]
  const rows = body ? [...body.rows] : []
  let column = Number(table.dataset.sorted)
  let descending = true

  const render = () => {
    const query = filter?.value.trim().toUpperCase() ?? ''
    const sorted = rows.toSorted((a, b) => {
      const [x, y] = [sortValue(a, column), sortValue(b, column)]
      const order = x < y ? -1 : x > y ? 1 : 0
      return descending ? -order : order
    })
    let shown = 0
    for (const row of sorted) {
      row.hidden = query !== '' && !row.dataset.search?.includes(query)
      shown += row.hidden ? 0 : 1
    }
    body?.append(...sorted)
    if (count) {
      count.textContent = `${shown} of ${rows.length} ${table.dataset.noun}`
    }
  }

  const preset = new URLSearchParams(location.search).get('q')
  if (filter && preset) {
    filter.value = preset
  }
  filter?.addEventListener('input', render)
  headers.forEach((header, index) =>
    header.querySelector('button')?.addEventListener('click', () => {
      descending =
        index === column ? !descending : header.hasAttribute('data-num')
      column = index
      render()
    }),
  )
  render()
}

document.querySelectorAll<HTMLTableElement>('table.sortable').forEach(wire)
