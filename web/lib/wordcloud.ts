export interface CloudWord {
  text: string
  weight: number
  group: boolean
}

export interface PlacedWord extends CloudWord {
  x: number
  y: number
  size: number
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

const GLYPH_WIDTH = 0.55
const PADDING = 4

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

function spiral(step: number) {
  const angle = step * 0.35
  const radius = 1.6 * angle
  return { dx: radius * Math.cos(angle) * 1.8, dy: radius * Math.sin(angle) }
}

export function wordCloud(
  words: CloudWord[],
  width: number,
  height: number,
  minSize: number,
  maxSize: number,
) {
  const heaviest = Math.max(...words.map(w => w.weight))
  const lightest = Math.min(...words.map(w => w.weight))
  const span = Math.sqrt(heaviest) - Math.sqrt(lightest) || 1
  const taken: Box[] = []
  return words
    .toSorted((a, b) => b.weight - a.weight)
    .flatMap(word => {
      const size =
        minSize +
        ((Math.sqrt(word.weight) - Math.sqrt(lightest)) / span) *
          (maxSize - minSize)
      const halfWidth = (word.text.length * size * GLYPH_WIDTH) / 2 + PADDING
      const halfHeight = size / 2 + PADDING
      for (let step = 0; step < 4000; step += 1) {
        const { dx, dy } = spiral(step)
        const x = width / 2 + dx
        const y = height / 2 + dy
        const box = {
          left: x - halfWidth,
          right: x + halfWidth,
          top: y - halfHeight,
          bottom: y + halfHeight,
        }
        const fits =
          box.left >= 0 &&
          box.right <= width &&
          box.top >= 0 &&
          box.bottom <= height &&
          !taken.some(other => overlaps(box, other))
        if (fits) {
          taken.push(box)
          return [{ ...word, x, y, size }]
        }
      }
      return []
    })
}
