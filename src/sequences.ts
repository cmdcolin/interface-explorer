import { list, number, record, records, text } from './json.ts'
import type { UniProtEntry } from './uniprot.ts'

export type Edit = [start: number, end: number, replacement: string]

export interface IsoformEdits {
  name: string
  displayed: boolean
  edits: Edit[]
}

export function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareEdits(a: Edit, b: Edit) {
  return a[0] - b[0] || a[1] - b[1] || compareText(a[2], b[2])
}

function isoformId(isoform: Record<string, unknown>) {
  return text(list(isoform.isoformIds)[0]) ?? ''
}

function status(isoform: Record<string, unknown>) {
  return text(isoform.isoformSequenceStatus)
}

export function alternativeProducts(entry: UniProtEntry) {
  const comment = records(entry.comments).find(
    c => c.commentType === 'ALTERNATIVE PRODUCTS',
  )
  return records(comment?.isoforms)
}

export function displayedIsoform(entry: UniProtEntry) {
  const isoform = alternativeProducts(entry).find(
    i => status(i) === 'Displayed',
  )
  return isoform ? isoformId(isoform) : undefined
}

function alternativeSequence(feature: Record<string, unknown>): Edit {
  const location = record(feature.location)
  return [
    number(record(location.start).value) ?? 0,
    number(record(location.end).value) ?? 0,
    text(list(record(feature.alternativeSequence).alternativeSequences)[0]) ??
      '',
  ]
}

export function editsByIsoform(entry: UniProtEntry) {
  const vsps = new Map(
    records(entry.features)
      .filter(f => f.type === 'Alternative sequence')
      .map(f => [text(f.featureId) ?? '', alternativeSequence(f)] as const),
  )
  return new Map(
    alternativeProducts(entry)
      .filter(i => status(i) === 'Displayed' || status(i) === 'Described')
      .map(isoform => [
        isoformId(isoform),
        {
          name: text(record(isoform.name).value) ?? '',
          displayed: status(isoform) === 'Displayed',
          edits: list(isoform.sequenceIds)
            .flatMap(v => {
              const edit = vsps.get(text(v) ?? '')
              return edit ? [edit] : []
            })
            .sort(compareEdits),
        } satisfies IsoformEdits,
      ]),
  )
}

export function sharedEnds(original: string, replacement: string) {
  const shortest = Math.min(original.length, replacement.length)
  let prefix = 0
  while (prefix < shortest && original[prefix] === replacement[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < shortest - prefix &&
    original.at(-1 - suffix) === replacement.at(-1 - suffix)
  ) {
    suffix += 1
  }
  return [prefix, suffix] as const
}

export function replacedPositions(
  sequence: string,
  start: number,
  end: number,
  replacement: string,
) {
  const original = sequence.slice(start - 1, end)
  const [prefix, suffix] = sharedEnds(original, replacement)
  const middle = replacement.length - prefix - suffix
  return original.length === replacement.length
    ? [...replacement].map((letter, k) =>
        letter === original[k] ? start + k : null,
      )
    : [
        ...Array.from({ length: prefix }, (_, k) => start + k),
        ...Array.from({ length: middle }, () => null),
        ...Array.from({ length: suffix }, (_, k) => end - suffix + 1 + k),
      ]
}

export function applyEdits(sequence: string, edits: Edit[]) {
  const residues: [string, number | null][] = [...sequence].map(
    (letter, index) => [letter, index + 1],
  )
  for (const [start, end, replacement] of [...edits]
    .sort(compareEdits)
    .reverse()) {
    const positions = replacedPositions(sequence, start, end, replacement)
    residues.splice(
      start - 1,
      end - start + 1,
      ...[...replacement].map((letter, k): [string, number | null] => [
        letter,
        positions[k] ?? null,
      ]),
    )
  }
  return {
    sequence: residues.map(([letter]) => letter).join(''),
    positions: residues.map(([, position]) => position),
  }
}

function xrefs(entry: UniProtEntry, database: string) {
  return records(entry.uniProtKBCrossReferences).filter(
    x => x.database === database,
  )
}

function propertyValues(xref: Record<string, unknown>, key: string) {
  return records(xref.properties)
    .filter(p => p.key === key)
    .map(p => text(p.value) ?? '')
}

export function refseqByIsoform(entry: UniProtEntry) {
  const byIsoform = new Map<string | undefined, string[]>()
  for (const xref of xrefs(entry, 'RefSeq')) {
    for (const nucleotide of propertyValues(xref, 'NucleotideSequenceId')) {
      if (nucleotide.startsWith('NM_')) {
        const isoform = text(xref.isoformId)
        byIsoform.set(isoform, [...(byIsoform.get(isoform) ?? []), nucleotide])
      }
    }
  }
  return byIsoform
}

export function maneTranscript(entry: UniProtEntry) {
  return xrefs(entry, 'MANE-Select').flatMap(x =>
    propertyValues(x, 'RefSeqNucleotideId'),
  )[0]
}
