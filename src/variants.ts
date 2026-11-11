import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { LABELS } from './constants.ts'
import type { Label } from './constants.ts'
import { isRecord, number, parseJson, records, text } from './json.ts'
import { OUT } from './paths.ts'

export interface Variant {
  position: number
  label: Label
  change: string
  variation: number
  review: string
  chrom: string
  pos: number
  allele: string
}

export const VARIANTS = join(OUT, 'clinvar.ndjson')

function label(value: unknown) {
  return LABELS.find(l => l === value)
}

export function parseVariant(value: Record<string, unknown>) {
  const position = number(value.position)
  const variation = number(value.variation)
  const pos = number(value.pos)
  const significance = label(value.label)
  const change = text(value.change)
  const chrom = text(value.chrom)
  return position !== undefined &&
    variation !== undefined &&
    pos !== undefined &&
    significance &&
    change !== undefined &&
    chrom !== undefined
    ? [
        {
          position,
          label: significance,
          change,
          variation,
          review: text(value.review) ?? '',
          chrom,
          pos,
          allele: text(value.allele) ?? '',
        } satisfies Variant,
      ]
    : []
}

export async function readVariants(keep = (_accession: string) => true) {
  const byAccession = new Map<string, Variant[]>()
  for await (const line of createInterface({
    input: createReadStream(VARIANTS),
  })) {
    const row = parseJson(line)
    const accession = isRecord(row) ? text(row.accession) : undefined
    if (isRecord(row) && accession !== undefined && keep(accession)) {
      byAccession.set(accession, records(row.variants).flatMap(parseVariant))
    }
  }
  return byAccession
}

export function variantLine(accession: string, variants: Variant[]) {
  return `${JSON.stringify({ accession, variants })}\n`
}
