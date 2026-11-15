import { join } from 'node:path'

import { SURFACE } from './analyze.ts'
import {
  confidentResidues,
  isConfident,
  partnerName,
  readAtlas,
} from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { cachedCodonScores, codonMean } from './conservation.ts'
import type { CodonScores } from './conservation.ts'
import { MIN_PLDDT } from './constants.ts'
import { writeJson } from './json.ts'
import { pythonRound } from './numeric.ts'
import { SITE_DATA } from './paths.ts'

export const EXAMPLE_GENE = 'VEGFC'

export function residueTrack(protein: AtlasProtein, scores: CodonScores) {
  const confident = protein.interfaces.filter(isConfident)
  const contacts = new Set(
    confident.flatMap(c => confidentResidues(c, protein.length)),
  )
  return Array.from({ length: protein.length }, (_, i) => {
    const residue = i + 1
    const [plddt = 0, rsa = 0] = protein.context[residue] ?? []
    const phylop = codonMean(scores, residue)
    return {
      residue,
      phylop: phylop === undefined ? null : pythonRound(phylop, 2),
      region:
        plddt < MIN_PLDDT
          ? 'low confidence'
          : rsa < SURFACE
            ? 'buried'
            : contacts.has(residue)
              ? 'interface'
              : 'surface',
    }
  })
}

export function main(gene = EXAMPLE_GENE) {
  const protein = readAtlas().find(p => p.gene === gene)
  const scores = protein && cachedCodonScores(protein.accession)
  if (protein && scores) {
    writeJson(join(SITE_DATA, 'conservationExample.json'), {
      gene,
      partners: [
        ...new Set(protein.interfaces.filter(isConfident).map(partnerName)),
      ],
      residues: residueTrack(protein, scores),
    })
  } else {
    throw new Error(`No atlas entry or cached phyloP for ${gene}`)
  }
}

if (import.meta.main) {
  main(process.argv[2])
}
