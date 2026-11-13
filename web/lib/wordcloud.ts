export interface CloudWord {
  text: string
  weight: number
  group: boolean
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

const GLYPH_WIDTH = 0.58
const PADDING = 4

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

const STRETCH = 1.8
const STEP = 4

function spiral(width: number, height: number) {
  const reach = Math.hypot(width / 2 / STRETCH, height / 2)
  const points: { dx: number; dy: number }[] = []
  for (let angle = 0; 1.6 * angle <= reach; angle += Math.min(0.35, STEP / (1.6 * angle * STRETCH || 1))) {
    const radius = 1.6 * angle
    points.push({ dx: radius * Math.cos(angle) * STRETCH, dy: radius * Math.sin(angle) })
  }
  return points
}

export function wordCloud<T extends CloudWord>(
  words: T[],
  width: number,
  height: number,
  minSize: number,
  maxSize: number,
) {
  const heaviest = Math.max(...words.map(w => w.weight))
  const lightest = Math.min(...words.map(w => w.weight))
  const span = Math.sqrt(heaviest) - Math.sqrt(lightest) || 1
  const taken: Box[] = []
  const points = spiral(width, height)
  return words
    .toSorted((a, b) => b.weight - a.weight)
    .flatMap(word => {
      const size =
        minSize +
        ((Math.sqrt(word.weight) - Math.sqrt(lightest)) / span) *
          (maxSize - minSize)
      const halfWidth = (word.text.length * size * GLYPH_WIDTH) / 2 + PADDING
      const halfHeight = size / 2 + PADDING
      const boxAt = ({ dx, dy }: { dx: number; dy: number }) => ({
        left: width / 2 + dx - halfWidth,
        right: width / 2 + dx + halfWidth,
        top: height / 2 + dy - halfHeight,
        bottom: height / 2 + dy + halfHeight,
      })
      const spot = points.find(point => {
        const box = boxAt(point)
        return (
          box.left >= 0 &&
          box.right <= width &&
          box.top >= 0 &&
          box.bottom <= height &&
          !taken.some(other => overlaps(box, other))
        )
      })
      if (spot) {
        taken.push(boxAt(spot))
      }
      return spot ? [{ ...word, x: width / 2 + spot.dx, y: height / 2 + spot.dy, size }] : []
    })
}
