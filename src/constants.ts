export const CONTACT = 5
export const REACH = 15
export const CONFIDENT = 0.6
export const MIN_PLDDT = 70
export const MAX_COMPLEXES = 30
export const LABELS = ['pathogenic', 'uncertain', 'benign'] as const
export type Label = (typeof LABELS)[number]

const BP4_LOWEST = {
  from: 0,
  points: -3,
  code: 'BP4',
  strength: '3 points',
} as const

export const ALPHAMISSENSE_EVIDENCE = [
  { from: 0.99, points: 4, code: 'PP3', strength: 'strong' },
  { from: 0.972, points: 3, code: 'PP3', strength: '3 points' },
  { from: 0.906, points: 2, code: 'PP3', strength: 'moderate' },
  { from: 0.792, points: 1, code: 'PP3', strength: 'supporting' },
  { from: 0.17, points: 0, code: '', strength: 'indeterminate' },
  { from: 0.1, points: -1, code: 'BP4', strength: 'supporting' },
  { from: 0.071, points: -2, code: 'BP4', strength: 'moderate' },
  BP4_LOWEST,
] as const

export const PP3_SUPPORTING = 0.792
export const BP4_SUPPORTING = 0.169

export function alphaMissenseEvidence(score: number) {
  return ALPHAMISSENSE_EVIDENCE.find(band => score >= band.from) ?? BP4_LOWEST
}
