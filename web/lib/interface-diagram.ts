interface Point {
  x: number
  y: number
}

function blob(cx: number, cy: number, rx: number, ry: number, phase: number) {
  const points = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * 2 * Math.PI
    const wobble = 1 + 0.07 * Math.sin(3 * angle + phase) + 0.04 * Math.cos(5 * angle + phase)
    return { x: cx + rx * wobble * Math.cos(angle), y: cy + ry * wobble * Math.sin(angle) }
  })
  const at = (i: number) => points[(i + points.length) % points.length] ?? { x: cx, y: cy }
  const f = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  const segments = points.map((p, i) => {
    const [before, after, next] = [at(i - 1), at(i + 1), at(i + 2)]
    const c1 = { x: p.x + (after.x - before.x) / 6, y: p.y + (after.y - before.y) / 6 }
    const c2 = { x: after.x - (next.x - p.x) / 6, y: after.y - (next.y - p.y) / 6 }
    return `C${f(c1)} ${f(c2)} ${f(after)}`
  })
  return `M${f(at(0))}${segments.join('')}Z`
}

const seam = (dx: number) => `M${206 + dx} 0C${180 + dx} 60 ${232 + dx} 104 ${200 + dx} 180`

export function interfaceDiagram() {
  const protein = blob(120, 92, 112, 70, 0.6)
  const partner = blob(296, 90, 98, 64, 2.1)
  return `
    <svg class="interface-diagram" viewBox="0 0 400 200" role="img" aria-label="Cartoon of a disease protein touching its partner protein; the strip of the protein where they touch is the interface">
      <defs>
        <clipPath id="interface-left"><path d="${seam(-3)}H0V0Z" /></clipPath>
        <clipPath id="interface-right"><path d="${seam(3)}H400V0Z" /></clipPath>
        <clipPath id="interface-protein"><path d="${protein}" /></clipPath>
      </defs>
      <g clip-path="url(#interface-left)">
        <path d="${protein}" fill="var(--chain)" />
        <g clip-path="url(#interface-protein)">
          <path d="${seam(-3)}" fill="none" stroke="var(--interface)" stroke-width="34" />
        </g>
      </g>
      <path d="${partner}" fill="var(--partner)" clip-path="url(#interface-right)" />
      <g fill="currentColor" font-size="14" text-anchor="middle">
        <text x="95" y="96">protein</text>
        <text x="300" y="96" fill="var(--chip-text)">partner protein</text>
        <text x="180" y="196">interface</text>
      </g>
      <path d="M180 182L186 150" stroke="currentColor" stroke-width="1.2" />
    </svg>`
}
