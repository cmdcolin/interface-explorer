import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  ATLAS,
  confidentResidues,
  isConfident,
  readAtlas,
} from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { getJson } from './cache.ts'
import { codingPositions } from './coordinates.ts'
import { list, number, record, records, text, writeJson } from './json.ts'
import { DATA, SITE_DATA } from './paths.ts'
import { pythonRound } from './numeric.ts'
import {
  applyEdits,
  compareText,
  editsByIsoform,
  maneTranscript,
  refseqByIsoform,
} from './sequences.ts'
import type { IsoformEdits } from './sequences.ts'
import { accessionOf, diseaseEntries, geneOf, sequenceOf } from './uniprot.ts'
import type { UniProtEntry } from './uniprot.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

const FOLDED = 70
const UNFOLDED = 50
const BANDS = [90, FOLDED, UNFOLDED, 0]
const MOST = 0.5

interface Model {
  entryId: string
  cifUrl: string
  plddtDocUrl: string
  uniprotAccession: string
  sequence: string
}

type Pathogenic = [position: number, change: string]

export function segments(canonicalPositions: (number | null)[]) {
  const runs: [number, number, number][] = []
  canonicalPositions.forEach((position, index) => {
    const last = runs.at(-1)
    if (
      position !== null &&
      last &&
      last[1] + last[2] === position &&
      last[0] + last[2] === index + 1
    ) {
      last[2] += 1
    } else if (position !== null) {
      runs.push([index + 1, position, 1])
    }
  })
  return runs
}

function parseModel(value: Record<string, unknown>) {
  const entryId = text(value.entryId)
  const cifUrl = text(value.cifUrl) ?? ''
  const plddtDocUrl = text(value.plddtDocUrl)
  const uniprotAccession = text(value.uniprotAccession)
  const sequence = text(value.sequence) ?? ''
  return value.uniprotStart === 1 &&
    value.uniprotEnd === sequence.length &&
    cifUrl.includes('-F1-') &&
    entryId !== undefined &&
    plddtDocUrl !== undefined &&
    uniprotAccession !== undefined
    ? [
        {
          entryId,
          cifUrl,
          plddtDocUrl,
          uniprotAccession,
          sequence,
        } satisfies Model,
      ]
    : []
}

async function fullModels(accession: string) {
  const models = await getJson(
    `https://alphafold.ebi.ac.uk/api/prediction/${accession}`,
    join(DATA, 'monomers', `${accession}.json`),
  )
  return new Map(
    records(models)
      .flatMap(parseModel)
      .map(m => [m.uniprotAccession, m]),
  )
}

async function plddt(model: Model) {
  const scores = await getJson(
    model.plddtDocUrl,
    join(DATA, 'plddt', `${model.entryId}.json`),
    {},
    doc =>
      list(record(doc).confidenceScore).map(score =>
        pythonRound(number(score) ?? 0),
      ),
  )
  return list(scores).flatMap(score => number(score) ?? [])
}

export function bandRuns(scores: number[]) {
  const runs: [number, number][] = []
  for (const score of scores) {
    const band = BANDS.find(b => score >= b) ?? 0
    const last = runs.at(-1)
    if (last && last[0] === band) {
      last[1] += 1
    } else {
      runs.push([band, 1])
    }
  }
  return runs
}

function confidentInterfaces(atlasProtein: AtlasProtein | undefined) {
  const interfaces = new Map<string, Set<number>>()
  for (const complex of atlasProtein?.interfaces ?? []) {
    if (isConfident(complex)) {
      interfaces.set(
        complex.partner_gene || complex.partner || '',
        new Set(confidentResidues(complex)),
      )
    }
  }
  return new Map([...interfaces].filter(([, residues]) => residues.size > 0))
}

function mean(scores: number[]) {
  return pythonRound(scores.reduce((sum, s) => sum + s, 0) / scores.length, 1)
}

function scoreAt(scores: number[], position: number) {
  const score = scores[position - 1]
  if (score === undefined) {
    throw new RangeError(`no pLDDT at position ${position}`)
  }
  return score
}

function lost(residues: Set<number>, kept: Set<number>) {
  return [...residues].filter(r => !kept.has(r)).length
}

function lostShare(residues: Set<number>, kept: Set<number>) {
  return lost(residues, kept) / residues.size
}

function sortedNumbers(values: Iterable<number>) {
  return [...new Set(values)].sort((a, b) => a - b)
}

function isoformRecord(
  isoformId: string,
  info: IsoformEdits,
  model: Model,
  sequence: string,
  positions: (number | null)[],
  scores: number[],
  canonicalSequence: string,
  canonicalPlddt: number[],
  transcripts: Map<string | undefined, string[]>,
  pathogenic: Pathogenic[],
  interfaces: Map<string, Set<number>>,
) {
  const kept = new Set(positions.filter(p => p !== null))
  const shared = positions
    .slice(0, scores.length)
    .flatMap((p, i): [number, number][] =>
      p === null ? [] : [[scores[i] ?? 0, scoreAt(canonicalPlddt, p)]],
    )
  return {
    accession: isoformId,
    name: info.name,
    model: model.entryId,
    cif: model.cifUrl,
    length: sequence.length,
    meanPlddt: mean(scores),
    plddt: bandRuns(scores),
    segments: segments(positions),
    edits: info.edits.map(([start, end, replacement]) => ({
      start,
      end,
      original: canonicalSequence.slice(start - 1, end),
      replacement,
    })),
    refseq: transcripts.get(isoformId) ?? [],
    foldedChanged: canonicalPlddt.filter(
      (score, i) => score >= FOLDED && !kept.has(i + 1),
    ).length,
    unfolded: shared.filter(
      ([own, canonical]) => canonical >= FOLDED && own < UNFOLDED,
    ).length,
    pathogenicLost: sortedNumbers(
      pathogenic.flatMap(([position]) =>
        kept.has(position) ? [] : [position],
      ),
    ),
    pathogenicChanges: [...pathogenic]
      .sort((a, b) => a[0] - b[0] || compareText(a[1], b[1]))
      .flatMap(([position, change]) => (kept.has(position) ? [] : [change])),
    interfaceLost: Object.fromEntries(
      [...interfaces]
        .sort(([, a], [, b]) => lostShare(b, kept) - lostShare(a, kept))
        .flatMap(([partner, residues]) =>
          lost(residues, kept) > 0
            ? [[partner, [lost(residues, kept), residues.size]]]
            : [],
        ),
    ),
  }
}

function isoformNumber(isoform: string) {
  return Number.parseInt(isoform.slice(isoform.lastIndexOf('-') + 1), 10)
}

function displayedEdits(isoforms: Map<string, IsoformEdits>) {
  const displayed = [...isoforms].find(([, info]) => info.displayed)
  if (!displayed) {
    throw new Error('no displayed isoform')
  }
  return { displayed: displayed[0], info: displayed[1] }
}

interface Alternative {
  isoform: string
  info: IsoformEdits
  model: Model
  sequence: string
  positions: (number | null)[]
  scores: number[]
}

async function modelledGene(
  entry: UniProtEntry,
  isoforms: Map<string, IsoformEdits>,
  canonical: { model: Model; scores: number[] },
  alternatives: Alternative[],
  unmatched: number,
  atlasProtein: AtlasProtein | undefined,
  variants: Variant[],
) {
  const accession = accessionOf(entry)
  const sequence = sequenceOf(entry)
  const { displayed, info } = displayedEdits(isoforms)
  const mane = maneTranscript(entry)
  const transcripts = new Map(
    [...refseqByIsoform(entry)].map(([isoform, nms]) => [
      isoform,
      [...nms].sort((a, b) => Number(a !== mane) - Number(b !== mane)),
    ]),
  )
  const pathogenic = variants.flatMap((v): Pathogenic[] =>
    v.label === 'pathogenic' ? [[v.position, v.change]] : [],
  )
  const interfaces = confidentInterfaces(atlasProtein)
  const mapped = await codingPositions(accession, sequence.length)
  return {
    gene: geneOf(entry) || accession,
    accession,
    length: sequence.length,
    locus: mapped?.locus ?? null,
    canonical: {
      accession: displayed,
      name: info.name,
      model: canonical.model.entryId,
      cif: canonical.model.cifUrl,
      meanPlddt: mean(canonical.scores),
      plddt: bandRuns(canonical.scores),
      refseq: transcripts.get(displayed) ?? [],
    },
    described: isoforms.size,
    unmatched,
    partners: [...interfaces.keys()].sort(compareText),
    pathogenic: sortedNumbers(pathogenic.map(([position]) => position)),
    interface: sortedNumbers(
      [...interfaces.values()].flatMap(residues => [...residues]),
    ),
    isoforms: [...alternatives]
      .sort((a, b) => isoformNumber(a.isoform) - isoformNumber(b.isoform))
      .map(i =>
        isoformRecord(
          i.isoform,
          i.info,
          i.model,
          i.sequence,
          i.positions,
          i.scores,
          sequence,
          canonical.scores,
          transcripts,
          pathogenic,
          interfaces,
        ),
      ),
  }
}

async function geneRecord(
  entry: UniProtEntry,
  atlasByAccession: Map<string, AtlasProtein>,
  variants: Map<string, Variant[]>,
) {
  const accession = accessionOf(entry)
  const isoforms = editsByIsoform(entry)
  const models: Map<string, Model> =
    isoforms.size > 1 ? await fullModels(accession) : new Map()
  const displayed = [...isoforms].find(([, info]) => info.displayed)?.[0]
  const sequence = sequenceOf(entry)
  const canonicalModel = models.get(accession)
  const canonical =
    canonicalModel && canonicalModel.sequence === sequence
      ? { model: canonicalModel, scores: await plddt(canonicalModel) }
      : undefined
  const built = [...isoforms].flatMap(([isoform, info]) => {
    const model = models.get(isoform)
    return isoform !== displayed && model
      ? [{ isoform, info, model, ...applyEdits(sequence, info.edits) }]
      : []
  })
  const matching: Alternative[] = []
  for (const isoform of built) {
    if (isoform.sequence === isoform.model.sequence) {
      matching.push({ ...isoform, scores: await plddt(isoform.model) })
    }
  }
  const alternatives = matching.filter(i => i.scores.length > 0)
  return canonical && canonical.scores.length > 0 && alternatives.length > 0
    ? modelledGene(
        entry,
        isoforms,
        canonical,
        alternatives,
        built.length - matching.length,
        atlasByAccession.get(accession),
        variants.get(accession) ?? [],
      )
    : undefined
}

type GeneRecord = NonNullable<Awaited<ReturnType<typeof geneRecord>>>

async function safeRecord(
  entry: UniProtEntry,
  atlasByAccession: Map<string, AtlasProtein>,
  variants: Map<string, Variant[]>,
) {
  try {
    return await geneRecord(entry, atlasByAccession, variants)
  } catch (error) {
    console.log(
      `${accessionOf(entry)}: ${error instanceof Error ? `${error.name}: ${error.message}` : error}`,
    )
    return undefined
  }
}

async function inPool<T, R>(
  items: T[],
  workers: number,
  work: (item: T) => Promise<R>,
) {
  const results: R[] = []
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item !== undefined) {
        results[index] = await work(item)
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}

function summaryRow(gene: GeneRecord, page: string) {
  const { isoforms } = gene
  return {
    gene: gene.gene,
    page,
    accession: gene.accession,
    described: gene.described,
    modelled: isoforms.length + 1,
    shortest: Math.min(...isoforms.map(i => i.length)),
    length: gene.length,
    foldedChanged: Math.max(...isoforms.map(i => i.foldedChanged)),
    unfolded: Math.max(...isoforms.map(i => i.unfolded)),
    pathogenicLost: Math.max(...isoforms.map(i => i.pathogenicLost.length)),
    interfaceLost: isoforms.filter(i =>
      Object.values(i.interfaceLost).some(
        ([lostCount = 0, total = 0]) => lostCount >= MOST * total,
      ),
    ).length,
  }
}

export function isoformTotals(
  rows: { modelled: number; interfaceLost: number; pathogenicLost: number }[],
) {
  return {
    genes: rows.length,
    alternativeIsoforms: rows.reduce((n, row) => n + row.modelled - 1, 0),
    lackingInterface: rows.reduce((n, row) => n + row.interfaceLost, 0),
    genesLackingPathogenic: rows.filter(row => row.pathogenicLost > 0).length,
  }
}

async function main(workers = '4', ...accessions: string[]) {
  const withIsoforms = (await diseaseEntries()).filter(
    e => editsByIsoform(e).size > 1,
  )
  const entries = withIsoforms.filter(
    e => accessions.length === 0 || accessions.includes(accessionOf(e)),
  )
  const atlasByAccession = new Map(
    existsSync(ATLAS) ? readAtlas().map(p => [p.accession, p]) : [],
  )
  const wanted = new Set(entries.map(accessionOf))
  const variants = await readVariants(accession => wanted.has(accession))
  const genes = (
    await inPool(entries, Number(workers), e =>
      safeRecord(e, atlasByAccession, variants),
    )
  ).filter(r => r !== undefined)
  const repeated = new Map<string, number>()
  for (const { gene } of genes) {
    repeated.set(gene, (repeated.get(gene) ?? 0) + 1)
  }
  const pages = genes.map(gene => {
    const page =
      repeated.get(gene.gene) === 1
        ? gene.gene
        : `${gene.gene}_${gene.accession}`
    writeJson(join(SITE_DATA, 'isoforms', `${page}.json`), { ...gene, page })
    return summaryRow(gene, page)
  })
  writeJson(join(SITE_DATA, 'isoforms.json'), {
    checked: entries.length,
    described: withIsoforms.length,
    genes: pages.sort((a, b) => compareText(a.page, b.page)),
  })
  writeJson(join(SITE_DATA, 'isoformTotals.json'), isoformTotals(pages))
  console.log(
    `${genes.length} genes, ${genes.reduce((n, g) => n + g.isoforms.length, 0)} alternative isoforms; ${genes.reduce((n, g) => n + g.unmatched, 0)} left out for differing from their model's sequence`,
  )
}

if (import.meta.main) {
  await main(...process.argv.slice(2))
}
