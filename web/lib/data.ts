import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { mdResult } from '../../src/md.ts'

import type {
  Gene,
  GeneRow,
  Gpcr,
  IsoformIndex,
  IsoformRecord,
  IsoformTotals,
  Lead,
  Summary,
  Viral,
} from './types.ts'

const DATA = join(process.cwd(), 'site', 'data')

function read<T>(path: string): T {
  return JSON.parse(readFileSync(join(DATA, path), 'utf8'))
}

function once<T>(path: string) {
  let value: T | undefined
  return () => {
    value ??= read<T>(path)
    return value
  }
}

export const summary = once<Summary>('summary.json')
export const geneRows = once<GeneRow[]>('genes.json')
export const leadRows = once<Lead[]>('leads.json')
export const gpcr = once<Gpcr>('gpcr.json')
export const viral = once<Viral>('viral.json')
type Md = Awaited<ReturnType<typeof mdResult>>

export const md = once<Md>('md.json')
export const isoformIndex = once<IsoformIndex>('isoforms.json')
export const isoformTotals = once<IsoformTotals>('isoformTotals.json')
export const gene = (page: string) => read<Gene>(`genes/${page}.json`)
export const isoform = (page: string) =>
  read<IsoformRecord>(`isoforms/${page}.json`)
