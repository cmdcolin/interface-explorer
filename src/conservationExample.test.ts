import { describe, expect, it } from 'vitest'

import type { AtlasProtein } from './atlasData.ts'
import { residueTrack } from './conservationExample.ts'

describe('residueTrack', () => {
  const protein: AtlasProtein = {
    accession: 'P00000',
    gene: 'GENE',
    length: 5,
    complexes: 1,
    hetero: 1,
    homo: 0,
    interfaces: [
      {
        entity: 'AF-0',
        partner: null,
        partner_gene: null,
        modelled_as: null,
        iptm: null,
        ipsae: 0.8,
        pdockq: null,
        residues: { 1: 90, 2: 90 },
      },
    ],
    context: {
      1: [90, 0.5],
      2: [90, 0.5],
      3: [90, 0.5],
      4: [90, 0.1],
      5: [40, 0.5],
    },
  }

  it('splits residues into interface, other surface, buried and low confidence', () => {
    const scores = [
      [1, 2, 3],
      [4, 4, 4],
      [0.5, 0.5, 0.5],
      [6, 6, 6],
      [1, null, 1],
    ]
    expect(residueTrack(protein, scores)).toEqual([
      { residue: 1, phylop: 2, region: 'interface' },
      { residue: 2, phylop: 4, region: 'interface' },
      { residue: 3, phylop: 0.5, region: 'surface' },
      { residue: 4, phylop: 6, region: 'buried' },
      { residue: 5, phylop: null, region: 'low confidence' },
    ])
  })

  it('leaves out interfaces below the confidence cut-off', () => {
    const weak = {
      ...protein,
      interfaces: protein.interfaces.map(c => ({ ...c, ipsae: 0.3 })),
    }
    const scores = Array.from({ length: 5 }, () => [1, 1, 1])
    expect(residueTrack(weak, scores).map(r => r.region)).toEqual([
      'surface',
      'surface',
      'surface',
      'buried',
      'low confidence',
    ])
  })
})
