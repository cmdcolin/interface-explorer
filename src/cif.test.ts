import { expect, test } from 'vitest'

import { atomSiteRows, cifCategory } from './cif.ts'

const LOOPED = `data_x
#
loop_
_entity.id
_entity.type
_entity.pdbx_description
1 polymer 'Histamine H1 receptor'
2 polymer miniGsq
3 non-polymer
;a long
name
;
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.label_atom_id
ATOM 1 N
ATOM 2 "C1'"
HETATM 3 O
#
`

test('a looped category gives one record per row, with quoted and multi-line values', () => {
  expect(cifCategory(LOOPED, 'entity')).toEqual([
    { id: '1', type: 'polymer', pdbx_description: 'Histamine H1 receptor' },
    { id: '2', type: 'polymer', pdbx_description: 'miniGsq' },
    { id: '3', type: 'non-polymer', pdbx_description: 'a long\nname' },
  ])
})

test('a category written as tag and value pairs gives one record', () => {
  const content =
    "#\n_entity.id 1\n_entity.pdbx_description 'D(1A) dopamine receptor'\n#\n"
  expect(cifCategory(content, 'entity')).toEqual([
    { id: '1', pdbx_description: 'D(1A) dopamine receptor' },
  ])
})

test('a missing category has no rows', () => {
  expect(cifCategory(LOOPED, 'struct')).toEqual([])
})

test('atom rows are read by column', () => {
  expect(atomSiteRows(LOOPED).map(row => row.id)).toEqual(['1', '2', '3'])
})
