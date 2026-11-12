import { join } from 'node:path'

import { getText } from './cache.ts'
import { atomSiteRows } from './cif.ts'
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
