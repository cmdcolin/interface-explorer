function circleAt(event: Event) {
  return event.target instanceof SVGCircleElement ? event.target : undefined
}

function wireScatter() {
  const tip = document.getElementById('scatter-tip')
  const svg = document.querySelector('.scatter')
  svg?.addEventListener('pointermove', event => {
    const circle = circleAt(event)
    if (tip && event instanceof PointerEvent) {
      tip.hidden = !circle
      if (circle) {
        tip.innerHTML = circle.dataset.tip ?? ''
        tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`
        tip.style.top = `${event.clientY + 14}px`
      }
    }
  })
  svg?.addEventListener('pointerleave', () => {
    if (tip) {
      tip.hidden = true
    }
  })
  svg?.addEventListener('click', event => {
    const url = circleAt(event)?.dataset.url
    if (url) {
      location.href = url
    }
  })
}

function wireSearch() {
  const form = document.getElementById('gene-search')
  const input = form?.querySelector('input')
  const miss = document.getElementById('gene-search-miss')
  const options = [
    ...document.querySelectorAll<HTMLOptionElement>('#gene-names option'),
  ]
  const open = () => {
    const query = input?.value.trim().toUpperCase() ?? ''
    const url = options.find(o => o.value.toUpperCase() === query)?.dataset.url
    if (miss) {
      miss.textContent =
        url || !query
          ? ''
          : `No gene called ${input?.value.trim()} has a confident predicted partner.`
    }
    if (url) {
      location.href = url
    }
  }
  form?.addEventListener('submit', event => {
    event.preventDefault()
    open()
  })
  input?.addEventListener('input', event => {
    if (
      !(event instanceof InputEvent) ||
      event.inputType === 'insertReplacementText'
    ) {
      open()
    }
  })
}

wireScatter()
wireSearch()
