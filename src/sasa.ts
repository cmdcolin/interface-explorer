import { neighbourGrid, squaredDistance } from './contacts.ts'
import type { Point } from './contacts.ts'

export const PROBE = 1.4
export const SPHERE_POINTS = 100
const DEFAULT_RADIUS = 2

export const ATOMIC_RADII: Record<string, number> = {
  H: 1.2,
  HE: 1.4,
  C: 1.7,
  N: 1.55,
  O: 1.52,
  F: 1.47,
  NA: 2.27,
  MG: 1.73,
  P: 1.8,
  S: 1.8,
  CL: 1.75,
  K: 2.75,
  CA: 2.31,
  NI: 1.63,
  CU: 1.4,
  ZN: 1.39,
  SE: 1.9,
  BR: 1.85,
  CD: 1.58,
  I: 1.98,
  HG: 1.55,
}

export interface SurfaceAtom {
  coord: Point
  element: string
}

function goldenSpiral(n: number) {
  const step = Math.PI * (3 - Math.sqrt(5))
  const dz = 2 / n
  const points: Point[] = []
  for (
    let k = 0, z = 1 - dz / 2, longitude = 0;
    k < n;
    k++, z -= dz, longitude += step
  ) {
    const r = Math.sqrt(1 - z * z)
    points.push([
      Math.fround(Math.cos(longitude) * r),
      Math.fround(Math.sin(longitude) * r),
      Math.fround(z),
    ])
  }
  return points
}

export const SPHERE = goldenSpiral(SPHERE_POINTS)

export function atomAreas(atoms: SurfaceAtom[]) {
  const sized = atoms.map(atom => ({
    coord: atom.coord,
    radius: (ATOMIC_RADII[atom.element] ?? DEFAULT_RADIUS) + PROBE,
  }))
  const reach = sized.reduce((most, atom) => Math.max(most, atom.radius), 0) * 2
  const near = neighbourGrid(sized, atom => atom.coord, reach)
  const unit = (4 * Math.PI) / SPHERE_POINTS
  return sized.map(atom => {
    const [x, y, z] = atom.coord
    const r = atom.radius
    const surface = SPHERE.map(
      ([sx, sy, sz]) => [sx * r + x, sy * r + y, sz * r + z] satisfies Point,
    )
    const open = surface.map(() => true)
    for (const other of near(atom.coord)) {
      const apart = squaredDistance(atom.coord, other.coord)
      if (
        other !== atom &&
        apart <= reach * reach &&
        Math.sqrt(apart) < r + other.radius
      ) {
        const covered = other.radius * other.radius
        surface.forEach((point, k) => {
          if (open[k] && squaredDistance(other.coord, point) <= covered) {
            open[k] = false
          }
        })
      }
    }
    return open.filter(Boolean).length * (r * r * unit)
  })
}
