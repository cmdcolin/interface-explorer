import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

import { download } from './cache.ts'
import { number, readJson, record, writeJson } from './json.ts'
import { DATA, OUT } from './paths.ts'
import { readVariants } from './variants.ts'

const SUBSTITUTIONS_URL =
  'https://zenodo.org/records/10813168/files/AlphaMissense_aa_substitutions.tsv.gz?download=1'
const SUBSTITUTIONS = join(DATA, 'AlphaMissense_aa_substitutions.tsv.gz')
const SCORES = join(OUT, 'alphamissense.json')

export function parseScore(line: string) {
  const [accession, change, score] = line.split('\t')
  const pathogenicity = Number(score)
  return accession && change && score && Number.isFinite(pathogenicity)
    ? { accession, change, pathogenicity }
    : undefined
}

function changeScores(scores: unknown) {
  const byChange = new Map<string, number>()
  for (const [change, value] of Object.entries(record(scores))) {
    const score = number(value)
    if (score !== undefined) {
      byChange.set(change, score)
    }
  }
  return byChange
}

export function readScores() {
  const byAccession = new Map<string, Map<string, number>>()
  for (const [accession, scores] of Object.entries(record(readJson(SCORES)))) {
    byAccession.set(accession, changeScores(scores))
  }
  return byAccession
}

async function main() {
  await download(SUBSTITUTIONS_URL, SUBSTITUTIONS)
  const wanted = new Map(
    (await readVariants())
      .entries()
      .map(([accession, variants]) => [
        accession,
        new Set(variants.map(v => v.change)),
      ]),
  )
  const scores = new Map<string, Record<string, number>>()
  for await (const line of createInterface({
    input: createReadStream(SUBSTITUTIONS).pipe(createGunzip()),
    crlfDelay: Infinity,
  })) {
    const found = parseScore(line)
    if (found && wanted.get(found.accession)?.has(found.change)) {
      const known = scores.get(found.accession) ?? {}
      known[found.change] = found.pathogenicity
      scores.set(found.accession, known)
    }
  }
  writeJson(SCORES, Object.fromEntries(scores))
  const total = [...wanted.values()].reduce((n, set) => n + set.size, 0)
  const scored = [...scores.values()].reduce(
    (n, known) => n + Object.keys(known).length,
    0,
  )
  console.log(
    `${scored} of ${total} classified missense changes have an AlphaMissense score, on ${scores.size} proteins`,
  )
}

if (import.meta.main) {
  await main()
}
