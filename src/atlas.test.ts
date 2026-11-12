import { expect, test } from 'vitest'

import {
  atomsByChain,
  distinctPartners,
  interfaceResidues,
  partnerIdentity,
} from './atlas.ts'

const COMPLEX = `data_x
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.B_iso_or_equiv
_atom_site.auth_asym_id
ATOM 1 N N 1 0.0 0.0 0.0 80.5 A
ATOM 2 C CA 1 1.5 0.0 0.0 81.5 A
ATOM 3 H H 1 9.0 0.0 0.0 82.5 A
ATOM 4 C CA 2 20.0 0.0 0.0 60.25 A
ATOM 5 N N 7 4.0 0.0 0.0 90.0 B
HETATM 6 C C1 . 21.0 0.0 0.0 50.0 B
#
`

test('atoms by chain skip hydrogens and ligands', () => {
  const chains = atomsByChain(COMPLEX)
  expect([...chains.keys()]).toEqual(['A', 'B'])
  expect(chains.get('A')).toEqual([
    { position: 1, coord: [0, 0, 0], plddt: 80.5 },
    { position: 1, coord: [1.5, 0, 0], plddt: 81.5 },
    { position: 2, coord: [20, 0, 0], plddt: 60.25 },
  ])
  expect(chains.get('B')).toHaveLength(1)
})

test('interface residues take the last contacting atom of each residue', () => {
  const chains = atomsByChain(COMPLEX)
  expect(
    interfaceResidues(chains.get('A') ?? [], chains.get('B') ?? []),
  ).toEqual(new Map([[1, 81.5]]))
  expect(
    interfaceResidues(chains.get('B') ?? [], chains.get('A') ?? []),
  ).toEqual(new Map([[7, 90]]))
})

test('a non-human partner takes the identity of its sequence-identical human protein', () => {
  const human = new Map([
    [
      'ABC',
      [
        {
          primaryAccession: 'P63218',
          genes: [{ geneName: { value: 'GNG5' } }],
        },
      ],
    ],
  ])
  const rat = {
    uniprotAccession: 'P63219',
    gene: 'Gng5',
    taxId: 10116,
    organismScientificName: 'Rattus norvegicus',
    sequenceChecksum: 'abc',
  }
  expect(partnerIdentity(rat, human)).toEqual({
    partner: 'P63218',
    partner_gene: 'GNG5',
    modelled_as: { accession: 'P63219', organism: 'Rattus norvegicus' },
  })
  expect(partnerIdentity({ ...rat, sequenceChecksum: 'def' }, human)).toEqual({
    partner: 'P63219',
    partner_gene: 'Gng5',
    modelled_as: { accession: 'P63219', organism: 'Rattus norvegicus' },
  })
  expect(
    partnerIdentity(
      { ...rat, taxId: 9606, organismScientificName: 'Homo sapiens' },
      human,
    ),
  ).toEqual({ partner: 'P63219', partner_gene: 'Gng5', modelled_as: null })
})

test('a partner modelled twice keeps its first, most confident complex', () => {
  const complex = (entity: string, partner: string) => ({
    entity,
    partner,
    partner_gene: null,
    modelled_as: null,
    iptm: null,
    ipsae: null,
    pdockq: null,
    residues: {},
  })
  expect(
    distinctPartners([
      complex('AF-1', 'P1'),
      complex('AF-2', 'P2'),
      complex('AF-3', 'P1'),
    ]).map(c => c.entity),
  ).toEqual(['AF-1', 'AF-2'])
})
