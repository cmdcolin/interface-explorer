export function pythonRound(value: number, digits = 0) {
  const exact =
    Number.isFinite(value) && Math.abs(value) < 1e21 ? value.toFixed(100) : ''
  const point = exact.indexOf('.')
  const kept = exact.slice(0, digits > 0 ? point + 1 + digits : point)
  const tie = /^50*$/.test(exact.slice(point + 1 + digits))
  const evenKept = Number(kept.at(-1)) % 2 === 0
  return exact === ''
    ? value
    : tie && evenKept
      ? Number(kept)
      : Number(value.toFixed(digits))
}

function roundHalfEven(value: number) {
  const floor = Math.floor(value)
  const fraction = value - floor
  return fraction < 0.5
    ? floor
    : fraction > 0.5
      ? floor + 1
      : floor % 2 === 0
        ? floor
        : floor + 1
}

export function numpyRound(value: number, digits = 0) {
  const scale = 10 ** digits
  return roundHalfEven(value * scale) / scale
}

const PAIRWISE_BLOCK = 128

export function pairwiseSum(values: number[]): number {
  return values.length < 8
    ? values.reduce((sum, value) => sum + value, 0)
    : values.length <= PAIRWISE_BLOCK
      ? blockSum(values)
      : splitSum(values)
}

function blockSum(values: number[]) {
  const whole = values.length - (values.length % 8)
  const lanes = values.slice(0, 8)
  for (let i = 8; i < whole; i += 8) {
    lanes.forEach((_, j) => {
      lanes[j] = (lanes[j] ?? 0) + (values[i + j] ?? 0)
    })
  }
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = lanes
  return values
    .slice(whole)
    .reduce((sum, value) => sum + value, a + b + (c + d) + (e + f + (g + h)))
}

function splitSum(values: number[]) {
  const half = Math.floor(values.length / 2)
  const split = half - (half % 8)
  return pairwiseSum(values.slice(0, split)) + pairwiseSum(values.slice(split))
}

function lerp(a: number, b: number, t: number) {
  const difference = b - a
  return t >= 0.5 ? b - difference * (1 - t) : a + difference * t
}

export function nanPercentile(values: number[], percent: number) {
  const sorted = values
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b)
  const index = (sorted.length - 1) * (percent / 100)
  const below = Math.floor(index)
  const low = sorted[below]
  const high = sorted[Math.min(below + 1, sorted.length - 1)]
  return low === undefined || high === undefined
    ? NaN
    : lerp(low, high, index - below)
}

export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    const mixed = Math.imul(state ^ (state >>> 15), state | 1)
    const stirred =
      mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61))
    return ((stirred ^ (stirred >>> 14)) >>> 0) / 2 ** 32
  }
}
