export const CONTACT = 5
export const CONFIDENT = 0.6
export const MIN_PLDDT = 70
export const MAX_COMPLEXES = 30
export const LABELS = ['pathogenic', 'uncertain', 'benign'] as const
export type Label = (typeof LABELS)[number]
