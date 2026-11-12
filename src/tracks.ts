import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  confidentResidues,
  isConfident,
  partnerName,
  readAtlas,
} from './atlasData.ts'
import { getJson, getText } from './cache.ts'
import { CONFIDENT, MIN_PLDDT } from './constants.ts'
import type { Label } from './constants.ts'
import { codingPositions, mergeBlocks } from './coordinates.ts'
import { isRecord, list, record, records, text, writeJson } from './json.ts'
import { DATA, OUT, SITE_JBROWSE } from './paths.ts'
import { pythonRound } from './numeric.ts'
import { readVariants } from './variants.ts'

export const COLOURS = {
  pathogenic: '200,40,40',
  uncertain: '235,140,40',
  benign: '120,120,120',
} satisfies Record<Label, string>

const HG38 = 'https://jbrowse.org/ucsc/hg38/config.json'
const KEPT_TRACKS = [
  'hg38-ncbiRefSeqCurated',
  'hg38-clinvarMain',
  'hg38-phyloP100way',
]
const FILE =
  /^[\p{L}\p{N}_./-]+\.(bb|bw|gz|2bit|sizes|tbi|csi|fai|gzi|bed|txt|json|ix|ixx|tsv)$/u
const SIGNIFICANCE_COLORS = new Map([
  ['PG', 'rgb(210,0,0)'],
  ['LP', 'rgb(240,100,100)'],
  ['VUS', 'rgb(0,0,128)'],
  ['RF', 'rgb(90,90,190)'],
  ['CF', 'rgb(137,121,212)'],
  ['LB', 'rgb(100,200,100)'],
  ['BN', 'rgb(0,160,0)'],
  ['OT', 'rgb(128,128,128)'],
])

export function bed12(
  chrom: string,
  strand: string,
  blocks: [number, number][],
  name: string,
  score: number,
  colour: string,
) {
  const start = blocks[0]?.[0] ?? 0
  const end = blocks.at(-1)?.[1] ?? 0
  const sizes = blocks.map(([a, b]) => b - a).join(',')
  const starts = blocks.map(([a]) => a - start).join(',')
  return [
    chrom,
    start,
    end,
    name,
    score,
    strand,
    start,
    end,
    colour,
    blocks.length,
    sizes,
    starts,
  ].join('\t')
}

function bedTrack(
  trackId: string,
  name: string,
  file: string,
  description: string,
) {
  return {
    type: 'FeatureTrack',
    trackId,
    name,
    assemblyNames: ['hg38'],
    category: ['Interface explorer'],
    description,
    adapter: { type: 'BigBedAdapter', uri: file },
  }
}

export function absolute(node: unknown): unknown {
  return Array.isArray(node)
    ? node.map(absolute)
    : isRecord(node)
      ? Object.fromEntries(
          Object.entries(node).map(([key, value]) => [key, absolute(value)]),
        )
      : typeof node === 'string' && FILE.test(node)
        ? new URL(node, HG38).href
        : node
}

const SPAN = "get(feature,'end') - get(feature,'start')"
const LONGER = '+'
const SNV_BAND = 'SNVs'
const LONGER_BAND = '≥2 bp'
const HGVS = "jexl:split(get(feature,'origName'),' : ')[1]"

function translucent(color: string | undefined) {
  return color?.replace(/^rgb\((.*)\)$/, 'rgba($1,0.5)')
}

export function withSignificanceRows(track: Record<string, unknown>) {
  const basic = records(track.displays).find(
    display => display.type === 'LinearBasicDisplay',
  )
  const color = record(record(basic?.encoding).color)
  const field = text(color.field) ?? ''
  const scale = record(color.scale)
  const codes = list(scale.domain).map(code => text(code) ?? '')
  const names = list(scale.names)
  const labels = codes
    .slice(0, names.length)
    .map((code, i): [string, unknown] => [code, names[i]])
  const rows = {
    type: 'LinearMultiRowFeatureDisplay',
    height: 240,
    tooltip: HGVS,
    transform: [
      {
        type: 'formula',
        expr: `jexl:${SPAN} > 1 ? get(feature,'${field}') + '${LONGER}' : get(feature,'${field}')`,
        as: 'significanceRow',
      },
    ],
    marks: [
      {
        mark: 'rect',
        transform: [{ type: 'filter', expr: `jexl:${SPAN} > 1` }],
        encoding: {
          color: {
            field,
            scale: {
              type: 'ordinal',
              domain: codes,
              range: codes.map(code =>
                translucent(SIGNIFICANCE_COLORS.get(code)),
              ),
            },
          },
        },
      },
      {
        mark: 'rect',
        transform: [{ type: 'filter', expr: `jexl:${SPAN} <= 1` }],
      },
    ],
    rows: {
      field: 'significanceRow',
      sort: [...codes, ...codes.map(code => `${code}${LONGER}`)],
      labels: Object.fromEntries([
        ...labels,
        ...labels.map(([code, name]) => [`${code}${LONGER}`, name]),
      ]),
      colors: Object.fromEntries(
        codes.flatMap(code => [
          [code, SIGNIFICANCE_COLORS.get(code)],
          [`${code}${LONGER}`, SIGNIFICANCE_COLORS.get(code)],
        ]),
      ),
      groups: [
        { match: '\\+$', group: LONGER_BAND },
        { match: '^[^+]+$', group: SNV_BAND },
      ],
    },
    facet: { field: 'group', sort: [SNV_BAND, LONGER_BAND] },
    legend: { show: false },
  }
  return { ...track, displays: [...list(track.displays), rows] }
}

async function writeConfig(defaultLocus: string) {
  const hg38 = record(
    absolute(await getJson(HG38, join(DATA, 'hg38_config.json'))),
  )
  const kept = records(hg38.tracks).filter(track =>
    KEPT_TRACKS.includes(text(track.trackId) ?? ''),
  )
  const tracks = [
    ...kept.map(track =>
      track.trackId === 'hg38-clinvarMain'
        ? withSignificanceRows(track)
        : track,
    ),
    bedTrack(
      'interfaces',
      'Predicted interface codons (AlphaFold DB complexes)',
      'interfaces.bb',
      `Codons of residues within 5 Å of a partner in an AlphaFold DB heterodimer with ipSAE ≥ ${CONFIDENT}, residue pLDDT ≥ ${MIN_PLDDT}. One feature per partner.`,
    ),
    bedTrack(
      'interface-variants',
      'ClinVar missense at a predicted interface',
      'interface_variants.bb',
      'ClinVar missense variants (NCBI variant_summary) whose residue sits at a confident predicted interface. Red pathogenic, orange uncertain, grey benign.',
    ),
    bedTrack(
      'gpcr-interfaces',
      'Experimental GPCR–G protein interface codons (PDB)',
      'gpcr_interfaces.bb',
      'Codons of residues within 5 Å of the partner in cryo-EM and X-ray receptor–G protein complexes of biogenic amine receptors, selected from GPCRdb. One feature per structure and side, e.g. DRD1–GNAS (7JVQ).',
    ),
    bedTrack(
      'gpcr-interface-variants',
      'ClinVar missense at an experimental GPCR–G protein interface',
      'gpcr_interface_variants.bb',
      'ClinVar missense variants (NCBI variant_summary) whose residue contacts the partner in an experimental receptor–G protein complex. Red pathogenic, orange uncertain, grey benign.',
    ),
  ]
  const config = {
    assemblies: hg38.assemblies,
    plugins: hg38.plugins,
    aggregateTextSearchAdapters: hg38.aggregateTextSearchAdapters ?? [],
    tracks,
    defaultSession: {
      name: 'Interface explorer',
      views: [
        {
          type: 'LinearGenomeView',
          init: {
            assembly: 'hg38',
            loc: defaultLocus,
            tracks: [
              'hg38-ncbiRefSeqCurated',
              'interfaces',
              'interface-variants',
              'hg38-clinvarMain',
            ],
          },
        },
      ],
    },
  }
  writeJson(join(SITE_JBROWSE, 'config.json'), config, 2)
}

function byLocation(a: string, b: string) {
  const [chromA = '', startA = ''] = a.split('\t')
  const [chromB = '', startB = ''] = b.split('\t')
  return chromA < chromB
    ? -1
    : chromA > chromB
      ? 1
      : Number(startA) - Number(startB)
}

export async function writeBigBed(
  name: string,
  lines: string[],
  bedType: string,
) {
  const sizes = join(DATA, 'hg38.chrom.sizes')
  if (!existsSync(sizes)) {
    writeFileSync(
      sizes,
      await getText(
        'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chrom.sizes',
        join(DATA, 'hg38.chrom.sizes.gz'),
      ),
    )
  }
  const bed = join(OUT, `${name}.bed`)
  mkdirSync(OUT, { recursive: true })
  mkdirSync(SITE_JBROWSE, { recursive: true })
  writeFileSync(bed, `${[...lines].sort(byLocation).join('\n')}\n`)
  execFileSync(
    'bedToBigBed',
    ['-tab', `-type=${bedType}`, bed, sizes, join(SITE_JBROWSE, `${name}.bb`)],
    { stdio: 'inherit' },
  )
}

export function partnerList(partners: Iterable<string>, shown: number) {
  const listed = [...partners].sort()
  return `${listed.slice(0, shown).join(', ')}${listed.length > shown ? ` and ${listed.length - shown} more` : ''}`
}

async function main() {
  const proteins = readAtlas().filter(protein =>
    protein.interfaces.some(isConfident),
  )
  const confidentAccessions = new Set(proteins.map(p => p.accession))
  const variants = await readVariants(accession =>
    confidentAccessions.has(accession),
  )
  const interfaces: string[] = []
  const variantLines: string[] = []
  const unmapped: string[] = []
  for (const protein of proteins) {
    const coding = await codingPositions(protein.accession, protein.length)
    if (coding) {
      const partnersAt = new Map<number, Set<string>>()
      for (const complex of protein.interfaces.filter(isConfident)) {
        const partner = partnerName(complex)
        const ipsae = complex.ipsae ?? 0
        const residues = confidentResidues(complex, protein.length)
        for (const residue of residues) {
          partnersAt.set(
            residue,
            (partnersAt.get(residue) ?? new Set()).add(partner),
          )
        }
        const codons = residues.flatMap(coding.codon)
        if (codons.length) {
          interfaces.push(
            bed12(
              coding.chrom,
              coding.strand,
              mergeBlocks(codons),
              `${protein.gene}–${partner} (ipSAE ${pythonRound(ipsae, 2).toFixed(2)})`,
              Math.trunc(1000 * ipsae),
              '40,110,200',
            ),
          )
        }
      }
      for (const variant of variants.get(protein.accession) ?? []) {
        const touched = partnersAt.get(variant.position)
        if (touched) {
          const start = variant.pos - 1
          const name = `${protein.gene} ${variant.change} ${variant.label}; interface with ${partnerList(touched, 5)}`
          variantLines.push(
            `chr${variant.chrom}\t${start}\t${start + 1}\t${name}\t0\t${coding.strand}\t${start}\t${start + 1}\t${COLOURS[variant.label]}`,
          )
        }
      }
    } else {
      unmapped.push(protein.gene)
    }
  }
  await writeBigBed('interfaces', interfaces, 'bed12')
  await writeBigBed('interface_variants', variantLines, 'bed9')
  const [chrom = '', start = '0', end = '0'] = (
    interfaces.find(line => line.split('\t')[3]?.startsWith('GNAO1–')) ??
    interfaces[0] ??
    ''
  ).split('\t')
  await writeConfig(`${chrom}:${Number(start) - 2000}-${Number(end) + 2000}`)
  console.log(
    `${interfaces.length} interface features, ${variantLines.length} variants at confident interfaces; unmapped: ${JSON.stringify(unmapped)}`,
  )
}

if (import.meta.main) {
  await main()
}
