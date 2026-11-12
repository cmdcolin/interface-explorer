export interface ProteinContext {
  family: string
  locations: string[]
}

const MITOCHONDRION = /^Mitochondrion/
const OUTER_MEMBRANE = /^Mitochondrion outer membrane/

function insideMitochondria({ locations }: ProteinContext) {
  return (
    locations.length > 0 &&
    locations.every(l => MITOCHONDRION.test(l) && !OUTER_MEMBRANE.test(l))
  )
}

function neverMitochondrial({ locations }: ProteinContext) {
  return locations.length > 0 && !locations.some(l => MITOCHONDRION.test(l))
}

export function pairCaution(
  own: ProteinContext | undefined,
  partner: ProteinContext | undefined,
) {
  return {
    apart:
      own !== undefined &&
      partner !== undefined &&
      ((insideMitochondria(own) && neverMitochondrial(partner)) ||
        (insideMitochondria(partner) && neverMitochondrial(own))),
    paralogs:
      own !== undefined && own.family !== '' && own.family === partner?.family,
  }
}
