let shown = ''

function datasetOf(target: EventTarget | null, attribute: string) {
  const element = target instanceof Element ? target.closest(`[data-${attribute}]`) : null
  return element instanceof HTMLElement || element instanceof SVGElement ? (element.dataset[attribute] ?? '') : ''
}

function light(guide: string, isoform: string) {
  const next = `${guide} ${isoform}`
  if (next !== shown) {
    shown = next
    for (const path of document.querySelectorAll<SVGPathElement>('.guide')) {
      path.classList.toggle('shown', guide !== '' && path.dataset.for === guide)
    }
    for (const row of document.querySelectorAll<SVGGElement>('svg [data-guide], svg [data-isoform]')) {
      row.classList.toggle(
        'lit',
        (guide !== '' && (row.dataset.guide === guide || (row.dataset.members ?? '').split(' ').includes(guide))) ||
          (isoform !== '' && row.dataset.isoform === isoform),
      )
    }
  }
}

document.addEventListener('pointerover', event =>
  light(datasetOf(event.target, 'guide'), datasetOf(event.target, 'isoform')),
)
document.documentElement.addEventListener('pointerleave', () => light('', ''))
