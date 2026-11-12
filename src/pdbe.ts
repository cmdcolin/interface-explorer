import { join } from 'node:path'

import { getText } from './cache.ts'
import { atomSiteRows } from './cif.ts'
import { CONTACT } from './constants.ts'
import { neighbourGrid, squaredDistance } from './contacts.ts'
import type { Point } from './contacts.ts'
import { DATA } from './paths.ts'

export interface Source {
  accession: string
  number: number
}

export interface Atom {
  chain: string
  entity: string
  seq: number
  auth: number
  comp: string
  source: Source | undefined
  sourceLetter: string
  xyz: Point
}

export function mmcif(pdb: string) {
  return getText(
    `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdb.toLowerCase()}_updated.cif`,
    join(DATA, 'pdbe', `${pdb.toLowerCase()}.cif.gz`),
  )
}

export function atoms(cif: string) {
  return atomSiteRows(cif)
    .filter(
      row =>
        row.pdbx_PDB_model_num === '1' &&
        row.type_symbol !== 'H' &&
        row.label_seq_id !== '.' &&
        row.label_seq_id !== '?',
    )
    .map((row): Atom => ({
      chain: row.auth_asym_id ?? '',
      entity: row.label_entity_id ?? '',
      seq: Number(row.label_seq_id),
      auth: Number(row.auth_seq_id),
      comp: row.label_comp_id ?? '',
      source:
        row.pdbx_sifts_xref_db_name === 'UNP' &&
        row.pdbx_sifts_xref_db_num !== '?' &&
        row.pdbx_sifts_xref_db_num !== '.'
          ? {
              accession: row.pdbx_sifts_xref_db_acc ?? '',
              number: Number(row.pdbx_sifts_xref_db_num),
            }
          : undefined,
      sourceLetter: row.pdbx_sifts_xref_db_res ?? '',
      xyz: [Number(row.Cartn_x), Number(row.Cartn_y), Number(row.Cartn_z)],
    }))
}

export function contactChains(own: Atom[], other: Atom[]) {
  const near = neighbourGrid(other, atom => atom.xyz, CONTACT)
  const limit = CONTACT * CONTACT
  const counts = new Map<string, number>()
  for (const atom of own) {
    for (const neighbour of near(atom.xyz)) {
      if (squaredDistance(atom.xyz, neighbour.xyz) < limit) {
        const key = `${atom.chain}\t${neighbour.chain}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  const [chain = '', partner = ''] = (
    [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ??
    ''
  ).split('\t')
  return { own: chain, other: partner }
}
