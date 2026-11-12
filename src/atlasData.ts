import { join } from 'node:path'

import { CONFIDENT, MIN_PLDDT } from './constants.ts'
import { isRecord, number, readJson, record, records, text } from './json.ts'
import { DATA, OUT } from './paths.ts'

export interface Interface {
  entity: string
  partner: string | null
  partner_gene: string | null
  modelled_as: { accession: string; organism: string } | null
  iptm: number | null
  ipsae: number | null
  pdockq: number | null
  residues: Record<string, number>
}

export interface ProteinInterfaces {
  complexes: number
  hetero: number
  interfaces: Interface[]
}

export interface AtlasProtein extends ProteinInterfaces {
  accession: string
  gene: string
  length: number
  context: Record<string, [number, number]>
}

export const ATLAS = join(OUT, 'atlas.json')

function numbers(value: unknown) {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, v]) => {
      const n = number(v)
      return n === undefined ? [] : [[key, n]]
    }),
  )
}

function parseModelledAs(value: unknown) {
  const { accession, organism } = record(value)
  const id = text(accession)
  const species = text(organism)
  return id && species ? { accession: id, organism: species } : null
}

function parseInterface(value: Record<string, unknown>): Interface {
  return {
    entity: text(value.entity) ?? '',
    partner: text(value.partner) ?? null,
    partner_gene: text(value.partner_gene) ?? null,
    modelled_as: parseModelledAs(value.modelled_as),
    iptm: number(value.iptm) ?? null,
    ipsae: number(value.ipsae) ?? null,
    pdockq: number(value.pdockq) ?? null,
    residues: numbers(value.residues),
  }
}

function parseContext(value: unknown) {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, v]) => {
      const [plddt, rsa] = Array.isArray(v) ? v.map(number) : []
      return plddt === undefined || rsa === undefined
        ? []
        : [[key, [plddt, rsa] satisfies [number, number]]]
    }),
  )
}

export function parseAtlasProtein(
  value: Record<string, unknown>,
): AtlasProtein {
  return {
    accession: text(value.accession) ?? '',
    gene: text(value.gene) ?? '',
    length: number(value.length) ?? 0,
    complexes: number(value.complexes) ?? 0,
    hetero: number(value.hetero) ?? 0,
    interfaces: records(value.interfaces).map(parseInterface),
    context: parseContext(value.context),
  }
}

export function readAtlas() {
  return records(readJson(ATLAS)).filter(isRecord).map(parseAtlasProtein)
}

export function partnerName(complex: Interface) {
  return complex.partner_gene || complex.partner || ''
}

export function isConfident(complex: Interface) {
  return (complex.ipsae ?? 0) >= CONFIDENT
}

export function confidentResidues(complex: Interface, length = Infinity) {
  return Object.entries(complex.residues)
    .filter(
      ([residue, plddt]) => plddt >= MIN_PLDDT && Number(residue) <= length,
    )
    .map(([residue]) => Number(residue))
}

export function modelChain(entity: string, accession: string) {
  return text(
    records(readJson(join(DATA, 'models', `${entity}.json`))).find(
      chain => chain.uniprotAccession === accession,
    )?.chainId,
  )
}
