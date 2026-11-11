import { expect, test } from 'vitest'

import { atomsByChain, interfaceResidues } from './atlas.ts'

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
