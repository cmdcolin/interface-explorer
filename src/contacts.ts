export type Point = [number, number, number]

const SPAN = 1 << 16
const HALF = SPAN / 2
const OFFSETS = [-1, 0, 1].flatMap(i =>
  [-1, 0, 1].flatMap(j => [-1, 0, 1].map(k => [i, j, k] satisfies Point)),
)

function cellOf(point: Point, size: number) {
  return point.map(c => Math.floor(c / size))
}

function cellKey([x = 0, y = 0, z = 0]: number[]) {
  return ((x + HALF) * SPAN + (y + HALF)) * SPAN + (z + HALF)
}

export function squaredDistance(a: Point, b: Point) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

export function neighbourGrid<T>(
  items: T[],
  pointOf: (item: T) => Point,
  distance: number,
) {
  const size = distance * (1 + 1e-9)
  const cells = new Map<number, T[]>()
  for (const item of items) {
    const key = cellKey(cellOf(pointOf(item), size))
    const cell = cells.get(key)
    if (cell) {
      cell.push(item)
    } else {
      cells.set(key, [item])
    }
  }
  return (point: Point) => {
    const cell = cellOf(point, size)
    return OFFSETS.flatMap(
      offset =>
        cells.get(cellKey(cell.map((c, i) => c + (offset[i] ?? 0)))) ?? [],
    )
  }
}

export function withinDistance(own: Point[], other: Point[], distance: number) {
  const limit = distance * distance
  const near =
    distance > 0
      ? neighbourGrid(other, point => point, distance)
      : () => [] satisfies Point[]
  return own.map(point =>
    near(point).some(neighbour => squaredDistance(point, neighbour) < limit),
  )
}
