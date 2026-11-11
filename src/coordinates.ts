import { join } from 'node:path'

import { genomeToTranscriptSeqMapping } from 'g2p_mapper'

import { getJson } from './cache.ts'
import { number, record, records, text } from './json.ts'
import { DATA } from './paths.ts'

const CHROMOSOMES = new Map([
  ...[...Array.from({ length: 22 }, (_, i) => `${i + 1}`), 'X', 'Y'].map(
    c => [c, c] satisfies [string, string],
  ),
  ['Mitochondrion', 'M'] satisfies [string, string],
])

function exonSpans(location: Record<string, unknown>) {
  return records(location.exon).flatMap(exon => {
    const span = record(exon.genomeLocation)
    const begin = number(record(span.begin ?? span.position).position)
    const end = number(record(span.end ?? span.position).position)
    return begin === undefined || end === undefined
      ? []
      : [{ start: Math.min(begin, end) - 1, end: Math.max(begin, end) }]
  })
}

function transcriptCoding(transcript: Record<string, unknown>, length: number) {
  const location = record(transcript.genomicLocation)
  const chromosome = CHROMOSOMES.get(text(location.chromosome) ?? '')
  const spans = exonSpans(location)
  const bases = spans.reduce((n, span) => n + span.end - span.start, 0)
  return chromosome !== undefined &&
    (bases === 3 * length || bases === 3 * length + 3)
    ? [
        {
          chrom: `chr${chromosome}`,
          reverse: location.reverseStrand === true,
          spans,
        },
      ]
    : []
}

export async function codingPositions(accession: string, length: number) {
  const data = await getJson(
    `https://www.ebi.ac.uk/proteins/api/coordinates/${accession}`,
    join(DATA, 'coordinates', `${accession}.json`),
    { format: 'json' },
  )
  const coding = records(record(data).gnCoordinate).flatMap(transcript =>
    transcriptCoding(transcript, length),
  )[0]
  if (coding) {
    const { chrom, reverse, spans } = coding
    const start = Math.min(...spans.map(span => span.start))
    const end = Math.max(...spans.map(span => span.end))
    const { p2gCodon } = genomeToTranscriptSeqMapping({
      refName: chrom,
      start,
      end,
      strand: reverse ? -1 : 1,
      subfeatures: spans.map(span => ({
        refName: chrom,
        ...span,
        type: 'CDS',
        phase: 0,
      })),
    })
    return {
      chrom,
      strand: reverse ? '-' : '+',
      start: start + 1,
      end,
      locus: `${chrom}:${start + 1}-${end}`,
      codon: (residue: number) => p2gCodon[residue - 1] ?? [],
    }
  }
  return undefined
}

export type CodingPositions = NonNullable<
  Awaited<ReturnType<typeof codingPositions>>
>

export function mergeBlocks(positions: number[]) {
  const blocks: [number, number][] = []
  for (const position of [...positions].sort((a, b) => a - b)) {
    const last = blocks.at(-1)
    if (last && position === last[1]) {
      last[1] = position + 1
    } else {
      blocks.push([position, position + 1])
    }
  }
  return blocks
}
