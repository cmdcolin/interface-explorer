const body = document.querySelector<HTMLTableSectionElement>('#variants tbody')
const rows = body ? [...body.rows] : []
const marks = [...document.querySelectorAll<SVGElement>('.variant-mark')]
const sort = document.querySelector<HTMLSelectElement>('#variant-sort')
const condition =
  document.querySelector<HTMLSelectElement>('#variant-condition')
const leadsOnly = document.querySelector<HTMLInputElement>('#variant-leads')
const partnerDiseaseOnly = document.querySelector<HTMLInputElement>(
  '#variant-partner-disease',
)

function conditionsOf(element: HTMLElement | SVGElement) {
  const parsed: unknown = JSON.parse(element.dataset.conditions ?? '[]')
  return Array.isArray(parsed) ? parsed : []
}

function render() {
  const labels = new Set(
    [
      ...document.querySelectorAll<HTMLInputElement>(
        '.filters input[value]:checked',
      ),
    ].map(i => i.value),
  )
  const wanted = condition?.value ?? ''
  const visible = (element: HTMLElement | SVGElement) =>
    labels.has(element.dataset.label ?? '') &&
    (!wanted || conditionsOf(element).includes(wanted)) &&
    (!leadsOnly?.checked || element.dataset.lead !== undefined) &&
    (!partnerDiseaseOnly?.checked ||
      element.dataset.partnerDisease !== undefined)
  for (const row of rows) {
    row.hidden = !visible(row)
  }
  for (const mark of marks) {
    mark.style.display = visible(mark) ? '' : 'none'
  }
  const key =
    sort?.value === 'alphaMissense'
      ? 'am'
      : sort?.value === 'phylop'
        ? 'phylop'
        : 'position'
  const order = (row: HTMLTableRowElement) => Number(row.dataset[key])
  body?.append(
    ...rows.toSorted((a, b) =>
      key === 'position' ? order(a) - order(b) : order(b) - order(a),
    ),
  )
}

document
  .querySelectorAll('.filters input, .filters select')
  .forEach(input => input.addEventListener('change', render))
render()
