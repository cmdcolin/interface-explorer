import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { needlemanWunsch } from 'p2s_mapper'

import { proteinInterfaces } from './atlas.ts'
import { confidentResidues, isConfident, readAtlas } from './atlasData.ts'
import type { Interface, ProteinInterfaces } from './atlasData.ts'
import { getJson, getText } from './cache.ts'
import { cifCategory } from './cif.ts'
import { CONTACT, REACH } from './constants.ts'
import { nearestDistance, withinDistance } from './contacts.ts'
import type { Point } from './contacts.ts'
import { codingPositions, mergeBlocks } from './coordinates.ts'
import { number, record, records, text, writeJson } from './json.ts'
import { DATA, ROOT, SITE_DATA } from './paths.ts'
import { atoms, mmcif } from './pdbe.ts'
import type { Atom, Source } from './pdbe.ts'
import { pythonRound } from './numeric.ts'
import { COLOURS, bed12, partnerList, writeBigBed } from './tracks.ts'
import { geneOf, sequenceOf } from './uniprot.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

const STRUCTURES = join(ROOT, 'gpcr_structures.tsv')
const G_ALPHA_GENES = [
  'GNAS',
  'GNAL',
  'GNAQ',
  'GNA11',
  'GNA14',
  'GNA15',
  'GNAI1',
  'GNAI2',
  'GNAI3',
  'GNAO1',
  'GNAZ',
  'GNAT1',
  'GNAT2',
  'GNAT3',
  'GNA12',
  'GNA13',
]
const G_ALPHA = new RegExp(`^(${G_ALPHA_GENES.join('|')})$`)
const SUBTYPE_GENE = new Map([
  ['αs', 'GNAS'],
  ['αq', 'GNAQ'],
  ['αi1', 'GNAI1'],
  ['αo', 'GNAO1'],
])
export const WINDOW = 5
export const WINDOW_IDENTITY = 0.6
export const SWITCH = 4
export const DECLARED_WEIGHT = 1.25
const G_ALPHA_ENTITY = /subunit alpha|mini-?G|G protein subunit [sqio]\b/i
const INTERFACE_COLOUR = '0,140,90'
const THREE_TO_ONE = new Map([
  ['ALA', 'A'],
  ['CYS', 'C'],
  ['ASP', 'D'],
  ['GLU', 'E'],
  ['PHE', 'F'],
  ['GLY', 'G'],
  ['HIS', 'H'],
  ['ILE', 'I'],
  ['LYS', 'K'],
  ['LEU', 'L'],
  ['MET', 'M'],
  ['ASN', 'N'],
  ['PRO', 'P'],
  ['GLN', 'Q'],
  ['ARG', 'R'],
  ['SER', 'S'],
  ['THR', 'T'],
  ['VAL', 'V'],
  ['TRP', 'W'],
  ['TYR', 'Y'],
  ['ASX', 'B'],
  ['XAA', 'X'],
  ['GLX', 'Z'],
  ['XLE', 'J'],
  ['SEC', 'U'],
  ['PYL', 'O'],
  ['TER', '*'],
])

interface Ortholog {
  accession: string
  gene: string
  sequence: string
  pairs: Map<number, number>
  identity: number
}

interface Contact {
  letter: string
  chain: string
  auth: number
}

type Variants = Map<string, Variant[]>
type Atlas = Map<string, ProteinInterfaces>
type Structure = ReturnType<typeof structureRow>
type Side = Awaited<ReturnType<typeof side>>
type ComplexRecord = Awaited<ReturnType<typeof interfaceRecord>>

function structureRow(field: (name: string) => string) {
  return {
    entry: field('entry'),
    gene: field('gene'),
    receptor: field('receptor'),
    species: field('species'),
    method: field('method'),
    pdb: field('pdb'),
    resolution: field('resolution'),
    chain: field('chain'),
    state: field('state'),
    degree_active: field('degree_active'),
    g_family: field('g_family'),
    g_subtype: field('g_subtype'),
    g_note: field('g_note'),
    dataset: field('dataset'),
  }
}

function structures() {
  const [header = [], ...rows] = readFileSync(STRUCTURES, 'utf8')
    .split(/\r?\n/)
    .filter(line => line !== '')
    .map(line => line.split('\t'))
  return rows.map(cells =>
    structureRow(name => cells[header.indexOf(name)] ?? ''),
  )
}

function complexFields(structure: Structure) {
  return {
    pdb: structure.pdb,
    method: structure.method,
    resolution: structure.resolution,
    state: structure.state,
    species: structure.species,
    g_family: structure.g_family,
    g_subtype: structure.g_subtype,
    g_note: structure.g_note,
    receptor: structure.receptor,
    dataset: structure.dataset,
  }
}

function otherFields(structure: Structure) {
  return {
    pdb: structure.pdb,
    method: structure.method,
    resolution: structure.resolution,
    state: structure.state,
    species: structure.species,
    receptor: structure.receptor,
    gene: structure.gene,
    degree_active: structure.degree_active,
  }
}

export function seq1(comp: string) {
  return Array.from({ length: Math.floor(comp.length / 3) }, (_, i) =>
    comp.slice(3 * i, 3 * i + 3).toUpperCase(),
  )
    .map(code => THREE_TO_ONE.get(code) ?? 'X')
    .join('')
}

const uniprotCache = new Map<string, ReturnType<typeof fetchUniprot>>()

async function fetchUniprot(accession: string) {
  const base = accession.split('-')[0] ?? accession
  const entry = record(
    await getJson(
      `https://rest.uniprot.org/uniprotkb/${base}`,
      join(DATA, 'uniprot', `${base}.json`),
      {
        fields: 'accession,id,gene_primary,organism_id,sequence',
        format: 'json',
      },
    ),
  )
  const fasta = await getText(
    `https://rest.uniprot.org/uniprotkb/${accession}.fasta`,
    join(DATA, 'uniprot', `${accession}.fasta.gz`),
  )
  return {
    accession,
    id: (text(entry.uniProtkbId) ?? '').toLowerCase(),
    gene: geneOf(entry).toUpperCase(),
    sequence: fasta.split(/\r?\n/).slice(1).join(''),
  }
}

function uniprot(accession: string) {
  const cached = uniprotCache.get(accession) ?? fetchUniprot(accession)
  uniprotCache.set(accession, cached)
  return cached
}

export function genericNumbers(rows: unknown, sequence: string) {
  return new Map(
    records(rows).flatMap(row => {
      const position = number(row.sequence_number)
      const label =
        text(row.display_generic_number) ?? text(row.protein_segment)
      return position !== undefined &&
        label &&
        row.amino_acid === sequence[position - 1]
        ? [[position, label]]
        : []
    }),
  )
}

async function gpcrdbNumbering(accession: string) {
  const { id, sequence } = await uniprot(accession)
  const rows = await getJson(
    `https://gpcrdb.org/services/residues/extended/${id}/`,
    join(DATA, 'gpcrdb', `${id}.json`),
  )
  return genericNumbers(rows, sequence)
}

async function humanCandidates(gene: string) {
  const found = await getJson(
    'https://rest.uniprot.org/uniprotkb/search',
    join(DATA, 'uniprot', `human_${gene}.json`),
    {
      query: `gene_exact:${gene} AND organism_id:9606 AND reviewed:true`,
      fields: 'accession,gene_primary,sequence',
      format: 'json',
    },
  )
  return records(record(found).results).map(candidate => ({
    accession: text(candidate.primaryAccession) ?? '',
    sequence: sequenceOf(candidate),
  }))
}

export function residueMap(source: string, target: string) {
  const { alignedSeq1, alignedSeq2 } = needlemanWunsch(source, target)
  const pairs = new Map<number, number>()
  let a = 0
  let b = 0
  for (let column = 0; column < alignedSeq1.length; column++) {
    const fromSource = alignedSeq1[column] !== '-'
    const fromTarget = alignedSeq2[column] !== '-'
    a += fromSource ? 1 : 0
    b += fromTarget ? 1 : 0
    if (fromSource && fromTarget) {
      pairs.set(a, b)
    }
  }
  const identical = [...pairs].filter(
    ([from, to]) => source[from - 1] === target[to - 1],
  ).length
  return { pairs, identity: identical / target.length }
}

async function humanOrtholog(info: Awaited<ReturnType<typeof uniprot>>) {
  const scored = (await humanCandidates(info.gene))
    .filter(candidate => candidate.sequence)
    .map(candidate => ({
      candidate,
      ...residueMap(info.sequence, candidate.sequence),
    }))
  const best = scored.reduce((a, b) => (b.identity > a.identity ? b : a))
  return {
    accession: best.candidate.accession,
    gene: info.gene,
    sequence: best.candidate.sequence,
    pairs: best.pairs,
    identity: best.identity,
  } satisfies Ortholog
}

function gAlphaEntities(cif: string) {
  return new Set(
    cifCategory(cif, 'entity')
      .filter(entity => G_ALPHA_ENTITY.test(entity.pdbx_description ?? ''))
      .map(entity => entity.id ?? ''),
  )
}

export function chainSequence(chainAtoms: Pick<Atom, 'seq' | 'comp'>[]) {
  const compBySeq = new Map<number, string>()
  for (const { seq, comp } of chainAtoms) {
    const known = compBySeq.get(seq)
    compBySeq.set(seq, known === undefined || comp > known ? comp : known)
  }
  const numbers = [...compBySeq.keys()].sort((a, b) => a - b)
  return {
    numbers,
    sequence: numbers.map(n => seq1(compBySeq.get(n) ?? '') || 'X').join(''),
  }
}

export function withSources<A extends { seq: number }>(
  chainAtoms: A[],
  sourceBySeq: Map<number, Source>,
) {
  return chainAtoms.map(atom => ({
    ...atom,
    source: sourceBySeq.get(atom.seq),
  }))
}

async function alignedSources(chainAtoms: Atom[], accession: string) {
  const { numbers, sequence } = chainSequence(chainAtoms)
  const { pairs } = residueMap(sequence, (await uniprot(accession)).sequence)
  return withSources(
    chainAtoms,
    new Map(
      numbers.flatMap((seq, index) => {
        const number = pairs.get(index + 1)
        return number === undefined ? [] : [[seq, { accession, number }]]
      }),
    ),
  )
}

async function gAlphaReferences() {
  const byGene = await Promise.all(
    G_ALPHA_GENES.map(async gene =>
      (await humanCandidates(gene))
        .filter(candidate => candidate.sequence)
        .map(candidate => ({ gene, ...candidate })),
    ),
  )
  return byGene.flat()
}

export function windowIdentity(matches: boolean[], index: number) {
  const window = matches.slice(Math.max(0, index - WINDOW), index + WINDOW + 1)
  return window.filter(Boolean).length / window.length
}

function firstBest(values: number[]) {
  return values.reduce(
    (best, value, index) =>
      value > (values[best] ?? -Infinity) ? index : best,
    0,
  )
}

export function segmentPath(scores: number[][]) {
  const columns = scores[0]?.length ?? 0
  let totals = scores.map(row => row[0] ?? 0)
  const choices: number[][] = []
  for (let index = 1; index < columns; index++) {
    const leader = firstBest(totals)
    const lead = totals[leader] ?? 0
    choices.push(
      totals.map((total, c) => (total >= lead - SWITCH ? c : leader)),
    )
    totals = totals.map(
      (total, c) => Math.max(total, lead - SWITCH) + (scores[c]?.[index] ?? 0),
    )
  }
  const path = [firstBest(totals)]
  for (const previous of choices.toReversed()) {
    path.push(previous[path.at(-1) ?? 0] ?? 0)
  }
  return path.toReversed()
}

async function chimeraSources(
  chainAtoms: Atom[],
  preferredGene: string | undefined,
) {
  const { numbers, sequence } = chainSequence(chainAtoms)
  const aligned = (await gAlphaReferences())
    .map(reference => ({
      ...reference,
      ...residueMap(sequence, reference.sequence),
    }))
    .sort(
      (a, b) =>
        Number(a.gene !== preferredGene) - Number(b.gene !== preferredGene) ||
        b.identity - a.identity,
    )
  const matches = aligned.map(({ pairs, sequence: reference }) =>
    [...sequence].map((letter, k) => {
      const paired = pairs.get(k + 1)
      return paired !== undefined && letter === reference[paired - 1]
    }),
  )
  const weighted = matches.map((row, c) =>
    row.map(match =>
      match ? (aligned[c]?.gene === preferredGene ? DECLARED_WEIGHT : 1) : 0,
    ),
  )
  const path = segmentPath(weighted)
  const sources = new Map<number, Source>()
  numbers.forEach((seq, index) => {
    const choice = path[index] ?? 0
    const number = aligned[choice]?.pairs.get(index + 1)
    if (
      number !== undefined &&
      windowIdentity(matches[choice] ?? [], index) >= WINDOW_IDENTITY
    ) {
      sources.set(seq, { accession: aligned[choice]?.accession ?? '', number })
    }
  })
  return withSources(chainAtoms, sources)
}

async function receptorAccession(entry: string) {
  const found = await getJson(
    'https://rest.uniprot.org/uniprotkb/search',
    join(DATA, 'uniprot', `id_${entry}.json`),
    { query: `id:${entry.toUpperCase()}`, fields: 'accession', format: 'json' },
  )
  return text(records(record(found).results)[0]?.primaryAccession) ?? ''
}

function sourceKey({ accession, number }: Source) {
  return `${accession} ${number}`
}

function contacts(own: Atom[], other: Atom[]) {
  const within = withinDistance(
    own.map(atom => atom.xyz),
    other.map(atom => atom.xyz),
    CONTACT,
  )
  const residues = new Map<string, { source: Source } & Contact>()
  own.forEach((atom, i) => {
    if (within[i] && atom.source) {
      residues.set(sourceKey(atom.source), {
        source: atom.source,
        letter: seq1(atom.comp),
        chain: atom.chain,
        auth: atom.auth,
      })
    }
  })
  return [...residues.values()]
}

function nearestResidues(own: Atom[], other: Atom[]) {
  const distances = nearestDistance(
    own.map(atom => atom.xyz),
    other.map(atom => atom.xyz),
    REACH,
  )
  const closest = new Map<string, { source: Source; distance: number }>()
  own.forEach((atom, i) => {
    const distance = distances[i]
    if (atom.source && distance !== undefined) {
      const current = closest.get(sourceKey(atom.source))
      if (!current || distance < current.distance) {
        closest.set(sourceKey(atom.source), { source: atom.source, distance })
      }
    }
  })
  return [...closest.values()]
}

function distancesToHuman(
  rows: { source: Source; distance: number }[],
  orthologs: Map<string, Ortholog>,
) {
  const byAccession = new Map<string, Map<number, number>>()
  for (const { source, distance } of rows) {
    const human = orthologs.get(source.accession)
    const position = human?.pairs.get(source.number)
    if (human && position) {
      const found = byAccession.get(human.accession) ?? new Map<number, number>()
      const current = found.get(position)
      byAccession.set(
        human.accession,
        found.set(
          position,
          current === undefined ? distance : Math.min(current, distance),
        ),
      )
    }
  }
  return byAccession
}

function toHuman(
  residues: ({ source: Source } & Contact)[],
  orthologs: Map<string, Ortholog>,
) {
  const byAccession = new Map<string, Map<number, Contact>>()
  for (const { source, ...contact } of residues) {
    const human = orthologs.get(source.accession)
    const position = human?.pairs.get(source.number)
    if (human && position) {
      byAccession.set(
        human.accession,
        (byAccession.get(human.accession) ?? new Map()).set(position, contact),
      )
    }
  }
  return byAccession
}

const byNumber = (a: number, b: number) => a - b

async function side(
  accession: string,
  residues: Map<number, Contact>,
  orthologs: Map<string, Ortholog>,
  variants: Variants,
  partner: string | string[],
  chimera = false,
) {
  const matching = [...orthologs.values()].filter(
    o => o.accession === accession,
  )
  const human = matching[0]
  const coding = await codingPositions(accession, human?.sequence.length ?? 0)
  return {
    gene: human?.gene ?? '',
    accession,
    identity: pythonRound(Math.min(...matching.map(o => o.identity)), 2),
    residues: [...residues.keys()].sort(byNumber),
    chain: [...residues.values()][0]?.chain ?? '',
    auth: Object.fromEntries(
      [...residues]
        .sort(([a], [b]) => a - b)
        .map(([position, { auth }]) => [position, auth]),
    ),
    differing: [...residues]
      .filter(
        ([position, { letter }]) => human?.sequence[position - 1] !== letter,
      )
      .map(([position]) => position)
      .sort(byNumber),
    chimera,
    locus: coding?.locus ?? null,
    variants: (variants.get(accession) ?? [])
      .filter(v => residues.has(v.position))
      .map(v => ({
        change: v.change,
        label: v.label,
        position: v.position,
        variation: v.variation,
        chrom: v.chrom,
        pos: v.pos,
        allele: v.allele,
      })),
    partner,
  }
}

async function gpcrAccessions() {
  const found = await getJson(
    'https://rest.uniprot.org/uniprotkb/stream',
    join(DATA, 'uniprot_gpcrs.json'),
    {
      query: 'organism_id:9606 AND reviewed:true AND keyword:KW-0297',
      fields: 'accession',
      format: 'json',
    },
  )
  return new Set(
    records(record(found).results).map(r => text(r.primaryAccession) ?? ''),
  )
}

async function atlasEntry(atlas: Atlas, accession: string) {
  return atlas.get(accession) ?? (await proteinInterfaces(accession))
}

async function predictedInterfaces(
  atlas: Atlas,
  own: string,
  partners: (complex: Interface) => boolean,
) {
  return (await atlasEntry(atlas, own)).interfaces
    .toSorted((a, b) => (b.ipsae ?? 0) - (a.ipsae ?? 0))
    .filter(complex => isConfident(complex) && partners(complex))
    .map(complex => ({
      partner: complex.partner_gene || complex.partner || '',
      accession: complex.partner ?? '',
      residues: new Set(confidentResidues(complex)),
    }))
}

function agreement(
  experimental: Set<number>,
  prediction: Set<number>,
  partner: string,
) {
  const shared = [...experimental].filter(r => prediction.has(r)).length
  return {
    partner,
    predicted: prediction.size,
    shared,
    recall: pythonRound(shared / experimental.size, 2),
    precision: pythonRound(shared / prediction.size, 2),
  }
}

async function receptorPrediction(
  atlas: Atlas,
  receptor: Side,
  gGenes: string[],
) {
  const candidates = await predictedInterfaces(
    atlas,
    receptor.accession,
    complex => G_ALPHA.test(complex.partner_gene ?? ''),
  )
  return candidates.find(c => gGenes.includes(c.partner)) ?? candidates[0]
}

export function mappedResidues(residues: number[], pairs: Map<number, number>) {
  return residues.flatMap(r => {
    const mapped = pairs.get(r)
    return mapped === undefined ? [] : [mapped]
  })
}

async function predictedGAlpha(
  atlas: Atlas,
  receptorAccession: string,
  gProteins: Side[],
  accession: string,
  gDistances: Map<string, Map<number, number>>,
) {
  const { gene, sequence } = await uniprot(accession)
  const closest = new Map<number, number>()
  const mapped = await Promise.all(
    gProteins.map(async g => {
      const { pairs } = residueMap(
        (await uniprot(g.accession)).sequence,
        sequence,
      )
      for (const [position, distance] of gDistances.get(g.accession) ?? []) {
        const target = pairs.get(position)
        if (target !== undefined) {
          const current = closest.get(target)
          closest.set(
            target,
            current === undefined ? distance : Math.min(current, distance),
          )
        }
      }
      return mappedResidues(g.residues, pairs)
    }),
  )
  const experimental = new Set(mapped.flat())
  const gpcrs = await gpcrAccessions()
  const predictions = await predictedInterfaces(atlas, accession, complex =>
    gpcrs.has(complex.partner ?? ''),
  )
  const own = predictions.find(p => p.accession === receptorAccession)
  return own && experimental.size && own.residues.size
    ? {
        ...agreement(experimental, own.residues, gene),
        accession,
        distances: Object.fromEntries(
          [...closest]
            .sort(([a], [b]) => a - b)
            .map(([position, distance]) => [
              position,
              pythonRound(distance, 1),
            ]),
        ),
        experimental: [...experimental].sort(byNumber),
        predictedResidues: [...own.residues].sort(byNumber),
        receptors: predictions.map(p =>
          agreement(experimental, p.residues, p.partner),
        ),
      }
    : null
}

function gAlphaEntry(g: Side, length: number) {
  return {
    gene: g.gene,
    accession: g.accession,
    length,
    locus: g.locus,
    counts: new Map<number, number>(),
    receptors: new Array<string>(),
    chimeras: 0,
  }
}

async function gAlphaSummaries(
  complexes: ComplexRecord[],
  atlas: Atlas,
  variants: Variants,
) {
  const gpcrs = await gpcrAccessions()
  const byG = new Map<string, ReturnType<typeof gAlphaEntry>>()
  for (const complex of complexes) {
    for (const g of complex.gProteins) {
      const entry =
        byG.get(g.accession) ??
        gAlphaEntry(g, (await uniprot(g.accession)).sequence.length)
      entry.receptors.push(
        `${complex.receptorSide.gene} (${complex.pdb}${g.chimera ? ', chimera' : ''})`,
      )
      entry.chimeras += g.chimera ? 1 : 0
      for (const residue of g.residues) {
        entry.counts.set(residue, (entry.counts.get(residue) ?? 0) + 1)
      }
      byG.set(g.accession, entry)
    }
  }
  const summaries = await Promise.all(
    [...byG.values()].map(async entry => {
      const experimental = new Set(entry.counts.keys())
      const predictions = await predictedInterfaces(
        atlas,
        entry.accession,
        complex => gpcrs.has(complex.partner ?? ''),
      )
      const predicted = new Set(predictions.flatMap(p => [...p.residues]))
      return {
        ...entry,
        counts: [...entry.counts].sort(([a], [b]) => a - b),
        structures: entry.receptors.length,
        chimeraOnly: entry.chimeras === entry.receptors.length,
        afdbReceptors: predictions.map(p => p.partner),
        afdb: predicted.size
          ? agreement(experimental, predicted, `${predictions.length} GPCRs`)
          : null,
        variants: (variants.get(entry.accession) ?? [])
          .filter(v => experimental.has(v.position))
          .map(v => ({
            change: v.change,
            label: v.label,
            position: v.position,
            variation: v.variation,
          })),
      }
    }),
  )
  return summaries.sort((a, b) => b.structures - a.structures)
}

async function receptorChain(
  rows: Atom[],
  structure: Structure,
  receptorBase: string,
) {
  const chain = rows.filter(atom => atom.chain === structure.chain)
  const own = (atom: Atom) =>
    atom.source?.accession.split('-')[0] === receptorBase
  return chain.some(own)
    ? chain.map(atom => (own(atom) ? atom : { ...atom, source: undefined }))
    : alignedSources(chain, receptorBase)
}

async function gAlphaChains(rows: Atom[], cif: string, structure: Structure) {
  const gEntities = gAlphaEntities(cif)
  const isGAlpha = async (atom: Atom) =>
    atom.source !== undefined &&
    G_ALPHA.test((await uniprot(atom.source.accession)).gene)
  const chains = new Map<string, Atom[]>()
  for (const atom of rows) {
    if (gEntities.has(atom.entity) || (await isGAlpha(atom))) {
      const chain = chains.get(atom.chain)
      if (chain) {
        chain.push(atom)
      } else {
        chains.set(atom.chain, [atom])
      }
    }
  }
  const chimeras = new Set(
    [...chains]
      .filter(([, chainAtoms]) => !chainAtoms.some(atom => atom.source))
      .map(([chain]) => chain),
  )
  const gAtoms: Atom[] = []
  for (const [chain, chainAtoms] of chains) {
    const mapped = chimeras.has(chain)
      ? await chimeraSources(chainAtoms, SUBTYPE_GENE.get(structure.g_subtype))
      : chainAtoms
    for (const atom of mapped) {
      gAtoms.push(
        (await isGAlpha(atom)) ? atom : { ...atom, source: undefined },
      )
    }
  }
  return { gAtoms, chimera: chimeras.size > 0 }
}

async function structureAtoms(structure: Structure) {
  const cif = await mmcif(structure.pdb)
  const rows = atoms(cif)
  const receptorBase = await receptorAccession(structure.entry)
  const receptorAtoms = await receptorChain(rows, structure, receptorBase)
  const { gAtoms, chimera } = await gAlphaChains(rows, cif, structure)
  return receptorAtoms.length && gAtoms.length
    ? [{ structure, receptorBase, receptorAtoms, gAtoms, chimera }]
    : []
}

function centroid(points: Point[]) {
  return [0, 1, 2].map(
    k =>
      points.reduce((sum, point) => sum + (point[k] ?? 0), 0) / points.length,
  )
}

export function axis(from: Point[], to: Point[]) {
  const [a, b] = [centroid(from), centroid(to)]
  const d = a.map((x, k) => (b[k] ?? 0) - x)
  const length = Math.hypot(...d)
  return d.map(x => pythonRound(x / length, 3))
}

const mapped = (chainAtoms: Atom[]) =>
  chainAtoms.flatMap(atom => (atom.source ? [atom.xyz] : []))

async function structureContacts({
  structure,
  receptorBase,
  receptorAtoms,
  gAtoms,
  chimera,
}: Awaited<ReturnType<typeof structureAtoms>>[number]) {
  const sources = new Set(
    [...receptorAtoms, ...gAtoms].flatMap(atom =>
      atom.source ? [atom.source.accession] : [],
    ),
  )
  const orthologs = new Map(
    await Promise.all(
      [...sources].map(
        async accession =>
          [accession, await humanOrtholog(await uniprot(accession))] as const,
      ),
    ),
  )
  return {
    structure,
    chimera,
    orthologs,
    axis: axis(mapped(gAtoms), mapped(receptorAtoms)),
    receptorHuman: [...orthologs].find(
      ([accession]) => accession.split('-')[0] === receptorBase,
    )?.[1],
    receptorSides: toHuman(contacts(receptorAtoms, gAtoms), orthologs),
    gSides: toHuman(contacts(gAtoms, receptorAtoms), orthologs),
    gDistances: distancesToHuman(
      nearestResidues(gAtoms, receptorAtoms),
      orthologs,
    ),
  }
}

async function interfaceRecord(
  {
    structure,
    chimera,
    orthologs,
    axis,
    receptorHuman,
    receptorSides,
    gSides,
    gDistances,
  }: Awaited<ReturnType<typeof structureContacts>>,
  atlas: Atlas,
  variants: Variants,
) {
  const receptorAccession = receptorHuman?.accession ?? ''
  const gProteins = await Promise.all(
    [...gSides]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([accession, residues]) =>
        side(
          accession,
          residues,
          orthologs,
          variants,
          receptorHuman?.gene ?? '',
          chimera,
        ),
      ),
  )
  const gGenes = gProteins.map(g => g.gene).sort()
  const receptor = await side(
    receptorAccession,
    receptorSides.get(receptorAccession) ?? new Map(),
    orthologs,
    variants,
    gGenes,
  )
  const numbering = receptorAccession
    ? await gpcrdbNumbering(receptorAccession)
    : new Map<number, string>()
  const prediction = await receptorPrediction(atlas, receptor, gGenes)
  return {
    ...complexFields(structure),
    receptorSide: {
      ...receptor,
      generic: Object.fromEntries(
        receptor.residues.flatMap(position => {
          const label = numbering.get(position)
          return label ? [[position, label]] : []
        }),
      ),
      afdb:
        prediction && receptor.residues.length && prediction.residues.size
          ? agreement(
              new Set(receptor.residues),
              prediction.residues,
              prediction.partner,
            )
          : null,
    },
    gProteins,
    gAlphaAfdb: prediction
      ? await predictedGAlpha(
          atlas,
          receptorAccession,
          gProteins,
          prediction.accession,
          gDistances,
        )
      : null,
    axis,
  }
}

async function interfaceLines(complexes: ComplexRecord[]) {
  const features: string[] = []
  const marks = new Map<
    string,
    {
      variant: Side['variants'][number]
      gene: string
      strand: string
      where: Set<string>
    }
  >()
  for (const complex of complexes) {
    const receptor = complex.receptorSide
    const sides: [Side, string][] = [
      [
        receptor,
        complex.gProteins.map(g => g.gene).join('+') || `G${complex.g_subtype}`,
      ],
      ...complex.gProteins.map((g): [Side, string] => [g, receptor.gene]),
    ]
    for (const [own, partner] of sides) {
      const coding = await codingPositions(
        own.accession,
        (await uniprot(own.accession)).sequence.length,
      )
      if (coding && own.residues.length) {
        features.push(
          bed12(
            coding.chrom,
            coding.strand,
            mergeBlocks(own.residues.flatMap(coding.codon)),
            `${own.gene}–${partner} (${complex.pdb})`,
            1000,
            INTERFACE_COLOUR,
          ),
        )
        for (const variant of own.variants) {
          const key = [
            variant.chrom,
            variant.pos,
            own.gene,
            variant.change,
          ].join('\t')
          const mark = marks.get(key) ?? {
            variant,
            gene: own.gene,
            strand: coding.strand,
            where: new Set<string>(),
          }
          mark.where.add(`${partner} in ${complex.pdb}`)
          marks.set(key, mark)
        }
      }
    }
  }
  const variantLines = [...marks.values()].map(
    ({ variant, gene, strand, where }) =>
      `chr${variant.chrom}\t${variant.pos - 1}\t${variant.pos}\t${gene} ${variant.change} ${variant.label}; contacts ${partnerList(where, 3)}\t0\t${strand}\t${variant.pos - 1}\t${variant.pos}\t${COLOURS[variant.label]}`,
  )
  return { features, variantLines }
}

async function main() {
  const atlas: Atlas = new Map(readAtlas().map(p => [p.accession, p]))
  const listed = structures()
  const found = []
  for (const structure of listed.filter(s => s.g_family !== '-')) {
    for (const atomsFound of await structureAtoms(structure)) {
      found.push(await structureContacts(atomsFound))
    }
  }
  const humanAccessions = new Set(
    found.flatMap(f => [...f.orthologs.values()].map(o => o.accession)),
  )
  const variants = await readVariants(accession =>
    humanAccessions.has(accession),
  )
  const complexes = []
  for (const contactsFound of found) {
    complexes.push(await interfaceRecord(contactsFound, atlas, variants))
  }
  const { features, variantLines } = await interfaceLines(complexes)
  await writeBigBed('gpcr_interfaces', features, 'bed12')
  await writeBigBed('gpcr_interface_variants', variantLines, 'bed9')
  const others = listed.filter(s => s.g_family === '-').map(otherFields)
  const gAlphas = await gAlphaSummaries(complexes, atlas, variants)
  writeJson(join(SITE_DATA, 'gpcr.json'), { complexes, gAlphas, others })
  console.log(
    `${complexes.length} receptor–G protein complexes, ${features.length} interface features, ${variantLines.length} variants on them`,
  )
}

if (import.meta.main) {
  await main()
}
