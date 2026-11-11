import { join } from 'node:path'

import { getJson, getText } from './cache.ts'
import type { AtlasProtein, Interface, ProteinInterfaces } from './atlasData.ts'
import { ATLAS } from './atlasData.ts'
import { CONTACT, MAX_COMPLEXES } from './constants.ts'
import { withinDistance } from './contacts.ts'
import type { Point } from './contacts.ts'
import { number, records, text, writeJson } from './json.ts'
import { DATA, OUT } from './paths.ts'
import { numpyRound, pairwiseSum, pythonRound } from './numeric.ts'
import { atomAreas } from './sasa.ts'
import { accessionOf, diseaseEntries, geneOf, sequenceOf } from './uniprot.ts'

const ALPHAFOLD_API = 'https://alphafold.ebi.ac.uk/api'
const PROGRESS_EVERY = 250

export const MAX_ASA: Record<string, number> = {
  ALA: 129,
  ARG: 274,
  ASN: 195,
  ASP: 193,
  CYS: 167,
  GLN: 225,
  GLU: 223,
  GLY: 104,
  HIS: 224,
  ILE: 197,
  LEU: 201,
  LYS: 236,
  MET: 224,
  PHE: 240,
  PRO: 159,
  SER: 155,
  THR: 172,
  TRP: 285,
  TYR: 263,
  VAL: 174,
}

export interface ChainAtom {
  position: number
  coord: Point
  plddt: number
}

function atomSite(cif: string, groups: string[]) {
  const header: string[] = []
  const rows: string[][] = []
  for (const line of cif.split(/\r?\n/)) {
    if (line.startsWith('_atom_site.')) {
      header.push(line.slice('_atom_site.'.length).trim())
    } else if (header.length && groups.some(group => line.startsWith(group))) {
      rows.push(line.trim().split(/\s+/))
    }
  }
  const column = (tag: string) => {
    const index = header.indexOf(tag)
    return (row: string[]) => row[index] ?? fail(`KeyError: '${tag}'`)
  }
  return { rows, column }
}

function fail(message: string): never {
  throw new Error(message)
}

function numeric(value: string) {
  const parsed = Number(value)
  return value === '' || Number.isNaN(parsed)
    ? fail(`ValueError: not a number: '${value}'`)
    : parsed
}

export function atomsByChain(cif: string) {
  const { rows, column } = atomSite(cif, ['ATOM'])
  const element = column('type_symbol')
  const chain = column('auth_asym_id')
  const position = column('label_seq_id')
  const x = column('Cartn_x')
  const y = column('Cartn_y')
  const z = column('Cartn_z')
  const plddt = column('B_iso_or_equiv')
  const chains = new Map<string, ChainAtom[]>()
  for (const row of rows) {
    if (element(row) !== 'H') {
      const atom = {
        position: numeric(position(row)),
        coord: [numeric(x(row)), numeric(y(row)), numeric(z(row))],
        plddt: numeric(plddt(row)),
      } satisfies ChainAtom
      const atoms = chains.get(chain(row))
      if (atoms) {
        atoms.push(atom)
      } else {
        chains.set(chain(row), [atom])
      }
    }
  }
  return chains
}

export function interfaceResidues(own: ChainAtom[], partner: ChainAtom[]) {
  const contacts = withinDistance(
    own.map(atom => atom.coord),
    partner.map(atom => atom.coord),
    CONTACT,
  )
  const residues = new Map<number, number>()
  own.forEach((atom, i) => {
    if (contacts[i]) {
      residues.set(atom.position, atom.plddt)
    }
  })
  return residues
}

async function complexInterface(
  accession: string,
  entry: Record<string, unknown>,
) {
  const entity = text(entry.modelEntityId) ?? fail("KeyError: 'modelEntityId'")
  const chains = records(
    await getJson(
      `${ALPHAFOLD_API}/prediction/${entity}`,
      join(DATA, 'models', `${entity}.json`),
    ),
  )
  const own = chains.find(c => c.uniprotAccession === accession)
  const partner = chains.find(c => c.uniprotAccession !== accession)
  const cifUrl = text(own?.cifUrl)
  const atoms =
    own && partner && cifUrl
      ? atomsByChain(
          await getText(cifUrl, join(DATA, 'cif', `${entity}.cif.gz`)),
        )
      : new Map<string, ChainAtom[]>()
  const ownAtoms = atoms.get(text(own?.chainId) ?? '')
  const partnerAtoms = atoms.get(text(partner?.chainId) ?? '')
  const offset = (number(own?.uniprotStart) || 1) - 1
  return ownAtoms && partnerAtoms
    ? [
        {
          entity,
          partner: text(partner?.uniprotAccession) ?? null,
          partner_gene: text(partner?.gene) ?? null,
          iptm: number(entry.complexPredictionAccuracy_ipTM) ?? null,
          ipsae: number(entry.complexPredictionAccuracy_ipSAE) ?? null,
          pdockq: number(entry.complexPredictionAccuracy_pDockQ) ?? null,
          residues: Object.fromEntries(
            [...interfaceResidues(ownAtoms, partnerAtoms)].map(
              ([position, plddt]) => [position + offset, plddt],
            ),
          ),
        } satisfies Interface,
      ]
    : []
}

export async function proteinInterfaces(accession: string) {
  const complexes = records(
    await getJson(
      `${ALPHAFOLD_API}/complex/${accession}`,
      join(DATA, 'complexes', `${accession}.json`),
    ),
  )
  const hetero = complexes
    .filter(c => c.assemblyType === 'Hetero')
    .sort(
      (a, b) =>
        (number(b.complexPredictionAccuracy_ipSAE) || 0) -
        (number(a.complexPredictionAccuracy_ipSAE) || 0),
    )
  const interfaces: Interface[] = []
  for (const entry of hetero.slice(0, MAX_COMPLEXES)) {
    interfaces.push(...(await complexInterface(accession, entry)))
  }
  return {
    complexes: complexes.length,
    hetero: hetero.length,
    interfaces,
  } satisfies ProteinInterfaces
}

function monomerResidues(cif: string) {
  const { rows, column } = atomSite(cif, ['ATOM', 'HETATM'])
  const group = column('group_PDB')
  const element = column('type_symbol')
  const name = column('label_comp_id')
  const chain = column('auth_asym_id')
  const sequenceNumber = column('auth_seq_id')
  const insertion = column('pdbx_PDB_ins_code')
  const x = column('Cartn_x')
  const y = column('Cartn_y')
  const z = column('Cartn_z')
  const bFactor = column('B_iso_or_equiv')
  const model = column('pdbx_PDB_model_num')
  const firstModel = rows[0] ? model(rows[0]) : ''
  const atoms = rows
    .filter(row => model(row) === firstModel)
    .map(row => ({
      element: element(row).toUpperCase(),
      coord: [
        Math.fround(numeric(x(row))),
        Math.fround(numeric(y(row))),
        Math.fround(numeric(z(row))),
      ] satisfies Point,
      residue: [
        group(row),
        chain(row),
        sequenceNumber(row),
        insertion(row),
        name(row),
      ].join(' '),
      name: name(row),
      number: numeric(sequenceNumber(row)),
      plddt: numeric(bFactor(row)),
    }))
  const areas = atomAreas(atoms)
  const residues = new Map<
    string,
    { name: string; number: number; plddt: number; areas: number[] }
  >()
  atoms.forEach((atom, i) => {
    const residue = residues.get(atom.residue)
    if (residue) {
      residue.areas.push(areas[i] ?? 0)
    } else {
      residues.set(atom.residue, {
        name: atom.name,
        number: atom.number,
        plddt: atom.plddt,
        areas: [areas[i] ?? 0],
      })
    }
  })
  return [...residues.values()]
}

export async function proteinContext(accession: string) {
  const models = records(
    await getJson(
      `${ALPHAFOLD_API}/prediction/${accession}`,
      join(DATA, 'monomers', `${accession}.json`),
    ),
  )
  const whole = models.find(m => {
    const cifUrl = text(m.cifUrl)
    return (
      m.uniprotAccession === accession &&
      cifUrl !== undefined &&
      cifUrl !== '' &&
      m.uniprotStart === 1 &&
      m.uniprotEnd === (text(m.sequence) ?? '').length &&
      cifUrl.includes('-F1-')
    )
  })
  const cifUrl = text(whole?.cifUrl)
  const residues = cifUrl
    ? monomerResidues(
        await getText(cifUrl, join(DATA, 'monomer_cif', `${accession}.cif.gz`)),
      )
    : []
  return Object.fromEntries(
    residues.flatMap(residue => {
      const maximum = MAX_ASA[residue.name]
      return maximum === undefined
        ? []
        : [
            [
              String(residue.number),
              [
                pythonRound(residue.plddt, 1),
                numpyRound(pairwiseSum(residue.areas) / maximum, 3),
              ] satisfies [number, number],
            ],
          ]
    }),
  )
}

async function processProtein(
  accession: string,
  gene: string,
  sequence: string,
) {
  try {
    const interfaces = await proteinInterfaces(accession)
    return {
      accession,
      gene,
      length: sequence.length,
      ...interfaces,
      context: interfaces.hetero > 0 ? await proteinContext(accession) : {},
    } satisfies AtlasProtein
  } catch (error) {
    return {
      accession,
      gene,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
    }
  }
}

async function boundedMap<T, R>(
  items: T[],
  workers: number,
  work: (item: T) => Promise<R>,
  onDone: (finished: number) => void,
) {
  const results: R[] = []
  const queue = items.entries()
  let finished = 0
  await Promise.all(
    Array.from({ length: Math.max(1, workers) }, async () => {
      for (const [i, item] of queue) {
        results[i] = await work(item)
        finished += 1
        onDone(finished)
      }
    }),
  )
  return results
}

export async function main(workers = 4, accessions: string[] = []) {
  const entries = (await diseaseEntries()).filter(
    entry => !accessions.length || accessions.includes(accessionOf(entry)),
  )
  const results = await boundedMap(
    entries,
    workers,
    entry =>
      processProtein(accessionOf(entry), geneOf(entry), sequenceOf(entry)),
    finished => {
      if (finished % PROGRESS_EVERY === 0) {
        console.log(`${finished}/${entries.length}`)
      }
    },
  )
  const done = results.flatMap(r => ('error' in r ? [] : [r]))
  const failed = results.flatMap(r => ('error' in r ? [r] : []))
  const failures = join(OUT, 'atlas_failures.json')
  writeJson(ATLAS, done)
  writeJson(failures, failed, 2)
  console.log(
    `${done.length} proteins, ${done.filter(r => r.hetero > 0).length} with a hetero complex; ${failed.length} failed, listed in ${failures}`,
  )
}

if (import.meta.main) {
  const [workers, ...accessions] = process.argv.slice(2)
  await main(workers ? Number(workers) : undefined, accessions)
}
