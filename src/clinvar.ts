import { once } from 'node:events'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { LABELS as SIGNIFICANCE } from './constants.ts'
import type { Label } from './constants.ts'
import { DATA, OUT } from './paths.ts'
import {
  applyEdits,
  compareText,
  displayedIsoform,
  editsByIsoform,
  maneTranscript,
  refseqByIsoform,
} from './sequences.ts'
import { accessionOf, humanEntries, sequenceOf } from './uniprot.ts'
import type { UniProtEntry } from './uniprot.ts'
import { VARIANTS, variantLine } from './variants.ts'
import type { Variant } from './variants.ts'

const SUMMARY_URL =
  'https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz'
export const SUMMARY = join(DATA, 'variant_summary.txt.gz')
export const MISSENSE =
  /^(NM_\d+)\.\d+\([^)]*\):c\.\S+ \(p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})\)$/
export const AMINO_ACIDS = new Map([
  ['Ala', 'A'],
  ['Arg', 'R'],
  ['Asn', 'N'],
  ['Asp', 'D'],
  ['Cys', 'C'],
  ['Gln', 'Q'],
  ['Glu', 'E'],
  ['Gly', 'G'],
  ['His', 'H'],
  ['Ile', 'I'],
  ['Leu', 'L'],
  ['Lys', 'K'],
  ['Met', 'M'],
  ['Phe', 'F'],
  ['Pro', 'P'],
  ['Ser', 'S'],
  ['Thr', 'T'],
  ['Trp', 'W'],
  ['Tyr', 'Y'],
  ['Val', 'V'],
])
const AGREEMENT = 0.95
const LABELS = new Map<string, Label>([
  ['Pathogenic', 'pathogenic'],
  ['Likely pathogenic', 'pathogenic'],
  ['Pathogenic/Likely pathogenic', 'pathogenic'],
  ['Benign', 'benign'],
  ['Likely benign', 'benign'],
  ['Benign/Likely benign', 'benign'],
  ['Uncertain significance', 'uncertain'],
])

interface Mapping {
  sequence: string
  positions: (number | null)[]
}

interface Mutation {
  position: number
  change: string
}

async function download() {
  if (!existsSync(SUMMARY)) {
    const partial = SUMMARY.replace(/\.gz$/, '.part')
    const response = await fetch(SUMMARY_URL, {
      signal: AbortSignal.timeout(600_000),
    })
    if (!response.ok || !response.body) {
      throw new Error(`${SUMMARY_URL}: HTTP ${response.status}`)
    }
    mkdirSync(DATA, { recursive: true })
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
    renameSync(partial, SUMMARY)
  }
}

export function downloaded() {
  const modified = statSync(SUMMARY).mtime
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${modified.getFullYear()}-${pad(modified.getMonth() + 1)}-${pad(modified.getDate())}`
}

function missenseVariant(field: (name: string) => string) {
  const match = MISSENSE.exec(field('Name'))
  const label = LABELS.get(field('ClinicalSignificance').split(';')[0] ?? '')
  const [, transcript, wildType, position, mutant] = match ?? []
  const from = AMINO_ACIDS.get(wildType ?? '')
  const to = AMINO_ACIDS.get(mutant ?? '')
  return field('Assembly') === 'GRCh38' &&
    field('Type') === 'single nucleotide variant' &&
    transcript &&
    position &&
    label &&
    from &&
    to
    ? {
        transcript,
        variant: {
          position: Number(position),
          label,
          change: `${from}${position}${to}`,
          variation: Number(field('VariationID')),
          review: field('ReviewStatus'),
          chrom: field('Chromosome'),
          pos: Number(field('PositionVCF')),
          allele: `${field('ReferenceAlleleVCF')}>${field('AlternateAlleleVCF')}`,
        } satisfies Variant,
      }
    : undefined
}

async function missenseByTranscript() {
  const byTranscript = new Map<string, Variant[]>()
  let columns: Map<string, number> | undefined
  for await (const line of createInterface({
    input: createReadStream(SUMMARY).pipe(createGunzip()),
    crlfDelay: Infinity,
  })) {
    const fields = line.split('\t')
    if (columns) {
      const index = columns
      const found = missenseVariant(name => fields[index.get(name) ?? -1] ?? '')
      if (found) {
        const named = byTranscript.get(found.transcript)
        if (named) {
          named.push(found.variant)
        } else {
          byTranscript.set(found.transcript, [found.variant])
        }
      }
    } else {
      columns = new Map(fields.map((name, i) => [name, i]))
    }
  }
  return byTranscript
}

function canonicalMapping(sequence: string): Mapping {
  return {
    sequence,
    positions: Array.from({ length: sequence.length }, (_, i) => i + 1),
  }
}

function transcriptMaps(entry: UniProtEntry) {
  const sequence = sequenceOf(entry)
  const displayed = displayedIsoform(entry)
  const edits = editsByIsoform(entry)
  const mane = maneTranscript(entry)
  const maps = new Map<string, Mapping | undefined>()
  for (const [isoform, transcripts] of refseqByIsoform(entry)) {
    const isoformEdits = isoform === undefined ? undefined : edits.get(isoform)
    const known =
      isoform === displayed
        ? canonicalMapping(sequence)
        : isoformEdits
          ? applyEdits(sequence, isoformEdits.edits)
          : undefined
    for (const transcript of transcripts) {
      maps.set(transcript.split('.')[0] ?? '', known)
    }
  }
  const maneId = mane?.split('.')[0]
  if (maneId !== undefined && !maps.has(maneId)) {
    maps.set(maneId, undefined)
  }
  return maps
}

export function toCanonical<V extends Mutation>(
  variant: V,
  { sequence, positions }: Mapping,
) {
  const { position, change } = variant
  const canonical =
    position <= sequence.length && sequence[position - 1] === change[0]
      ? positions[position - 1]
      : undefined
  return canonical
    ? {
        ...variant,
        position: canonical,
        change: `${change[0]}${canonical}${change.at(-1)}`,
      }
    : undefined
}

export function onSequence(variant: Mutation, sequence: string) {
  return (
    variant.position <= sequence.length &&
    sequence[variant.position - 1] === variant.change[0]
  )
}

function count(tally: Map<string, number>, key: string, n: number) {
  tally.set(key, (tally.get(key) ?? 0) + n)
}

function proteinVariants(
  entry: UniProtEntry,
  byTranscript: Map<string, Variant[]>,
  tally: Map<string, number>,
) {
  const sequence = sequenceOf(entry)
  const found = new Map<number, Variant>()
  const ordered = [...transcriptMaps(entry)].sort(
    ([, a], [, b]) => Number(a === undefined) - Number(b === undefined),
  )
  for (const [transcript, known] of ordered) {
    const named = byTranscript.get(transcript) ?? []
    const agreeing = named.filter(v => onSequence(v, sequence)).length
    const trusted =
      known ??
      (named.length > 0 && agreeing >= AGREEMENT * named.length
        ? canonicalMapping(sequence)
        : undefined)
    const mapped = trusted ? named.map(v => toCanonical(v, trusted)) : []
    count(
      tally,
      known
        ? 'known'
        : trusted
          ? 'unassigned, agreeing'
          : 'unassigned, rejected',
      named.length,
    )
    count(tally, 'off the sequence', mapped.filter(m => m === undefined).length)
    const added = new Map<number, Variant>()
    for (const m of mapped) {
      if (m && !found.has(m.variation)) {
        added.set(m.variation, m)
      }
    }
    for (const [variation, m] of added) {
      found.set(variation, m)
    }
  }
  return [...found.values()].sort(
    (a, b) => a.position - b.position || compareText(a.change, b.change),
  )
}

function pythonDict(entries: Iterable<[string, number]>) {
  return `{${[...entries].map(([key, value]) => `'${key}': ${value}`).join(', ')}}`
}

async function writeVariants(lines: Iterable<string>) {
  mkdirSync(OUT, { recursive: true })
  const partial = `${VARIANTS}.${process.pid}.part`
  const out = createWriteStream(partial)
  for (const line of lines) {
    if (!out.write(line)) {
      await once(out, 'drain')
    }
  }
  out.end()
  await finished(out)
  renameSync(partial, VARIANTS)
}

async function main() {
  await download()
  const byTranscript = await missenseByTranscript()
  const tally = new Map<string, number>()
  const variants = new Map<string, Variant[]>()
  for (const entry of await humanEntries()) {
    variants.set(
      accessionOf(entry),
      proteinVariants(entry, byTranscript, tally),
    )
  }
  await writeVariants(
    variants
      .entries()
      .map(([accession, found]) => variantLine(accession, found)),
  )
  const all = [...variants.values()].flat()
  const counts = SIGNIFICANCE.map((label): [string, number] => [
    label,
    all.filter(v => v.label === label).length,
  ])
  const proteins = [...variants.values()].filter(v => v.length > 0).length
  console.log(
    `${all.length} classified missense variants on ${proteins} proteins ${pythonDict(counts)}; variants by transcript: ${pythonDict(tally)}`,
  )
}

if (import.meta.main) {
  await main()
}
