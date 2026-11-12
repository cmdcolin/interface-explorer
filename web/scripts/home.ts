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

wireScatter()

function wireTour() {
  const tour = document.querySelector('.tour')
  const video = tour?.querySelector('video')
  const play = tour?.querySelector('button')
  play?.addEventListener('click', () => {
    void video?.play()
  })
  video?.addEventListener('play', () => {
    video.controls = true
    if (play) {
      play.hidden = true
    }
  })
}

wireTour()
