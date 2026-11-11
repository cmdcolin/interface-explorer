import { join } from 'node:path'

import { positionRuns } from 'p2s_mapper'

import {
  confidentResidues,
  isConfident,
  partnerName,
  readAtlas,
} from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { downloaded } from './clinvar.ts'
import { CONFIDENT, CONTACT, LABELS, MIN_PLDDT } from './constants.ts'
import { codingPositions } from './coordinates.ts'
import type { CodingPositions } from './coordinates.ts'
import { readJson, record, writeJson } from './json.ts'
import { OUT, SITE_DATA } from './paths.ts'
import { readVariants } from './variants.ts'
import type { Variant } from './variants.ts'

export function runs(residues: number[]) {
  return positionRuns(residues)
    .map(({ start, end }) =>
      start === end - 1 ? `${start}` : `${start}–${end - 1}`,
    )
    .join(', ')
}

function labelCounts(variants: { label: Variant['label'] }[]) {
  return Object.fromEntries(
    LABELS.map(label => [
      label,
      variants.filter(v => v.label === label).length,
    ]),
  )
}

export function geneRecord(
  protein: AtlasProtein,
  variants: Variant[],
  coding: Pick<CodingPositions, 'chrom' | 'strand' | 'start' | 'end'>,
) {
  const atResidue = new Map<number, string[]>()
  const partners = protein.interfaces
    .toSorted((a, b) => (b.ipsae ?? 0) - (a.ipsae ?? 0))
    .filter(isConfident)
    .map(complex => {
      const residues = confidentResidues(complex, protein.length).sort(
        (a, b) => a - b,
      )
      const name = partnerName(complex)
      for (const residue of residues) {
        atResidue.set(residue, [...(atResidue.get(residue) ?? []), name])
      }
      return {
        gene: name,
        accession: complex.partner,
        ipsae: complex.ipsae,
        iptm: complex.iptm,
        pdockq: complex.pdockq,
        entity: complex.entity,
        residues: residues.length,
        runs: runs(residues),
      }
    })
  const atInterface = variants.flatMap(variant => {
    const names = atResidue.get(variant.position)
    return names
      ? [
          {
            change: variant.change,
            label: variant.label,
            position: variant.position,
            partners: [...new Set(names)].sort(),
            variation: variant.variation,
            review: variant.review,
            chrom: variant.chrom,
            pos: variant.pos,
            allele: variant.allele,
          },
        ]
      : []
  })
  return {
    gene: protein.gene,
    accession: protein.accession,
    length: protein.length,
    chrom: coding.chrom.replace(/^chr/, ''),
    start: coding.start,
    end: coding.end,
    strand: coding.strand,
    partners: partners.map(partner => ({
      ...partner,
      variants: atInterface.filter(v => v.partners.includes(partner.gene))
        .length,
    })),
    variants: atInterface.toSorted((a, b) =>
      a.position !== b.position
        ? a.position - b.position
        : a.change < b.change
          ? -1
          : a.change > b.change
            ? 1
            : 0,
    ),
    classified: variants.length,
    interfaceResidues: atResidue.size,
    counts: labelCounts(atInterface),
  }
}

async function main() {
  const proteins = readAtlas().filter(protein =>
    protein.interfaces.some(isConfident),
  )
  const accessions = new Set(proteins.map(p => p.accession))
  const variants = await readVariants(accession => accessions.has(accession))
  const analysis = record(readJson(join(OUT, 'analysis.json')))
  const mapped = await Promise.all(
    proteins.map(async protein => ({
      protein,
      coding: await codingPositions(protein.accession, protein.length),
    })),
  )
  const genes = mapped.flatMap(({ protein, coding }) =>
    coding
      ? [geneRecord(protein, variants.get(protein.accession) ?? [], coding)]
      : [],
  )
  const unmapped = mapped.flatMap(({ protein, coding }) =>
    coding ? [] : [protein.gene],
  )
  const repeated = Map.groupBy(genes, g => g.gene)
  const pages = genes.map(g => ({
    ...g,
    page:
      repeated.get(g.gene)?.length === 1 ? g.gene : `${g.gene}_${g.accession}`,
  }))
  for (const page of pages) {
    writeJson(join(SITE_DATA, 'genes', `${page.page}.json`), page)
  }
  const index = pages
    .map(g => ({
      gene: g.gene,
      page: g.page,
      accession: g.accession,
      partners: g.partners.length,
      topPartner: g.partners[0]?.gene,
      bestIpsae: g.partners[0]?.ipsae,
      interfaceResidues: g.interfaceResidues,
      length: g.length,
      ...g.counts,
    }))
    .sort((a, b) => (a.gene < b.gene ? -1 : a.gene > b.gene ? 1 : 0))
  const summaryCounts = record(analysis.summary)
  const controlled = record(analysis.controlled_for_order_and_surface)
  const summary = {
    proteins: summaryCounts['disease proteins'],
    withPartner: summaryCounts['with any predicted hetero complex'],
    genes: genes.length,
    unmapped: unmapped.length,
    partners: genes.reduce((n, g) => n + g.partners.length, 0),
    variantsAtInterface: labelCounts(genes.flatMap(g => g.variants)),
    enrichment: {
      all: controlled['all residues'],
      orderedSurface: controlled['ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)'],
    },
    thresholds: { ipsae: CONFIDENT, plddt: MIN_PLDDT, contact: CONTACT },
    provenance: { clinvarDownloaded: downloaded() },
  }
  writeJson(join(SITE_DATA, 'genes.json'), index)
  writeJson(join(SITE_DATA, 'summary.json'), summary)
  console.log(
    `${genes.length} gene pages, ${summary.partners} partners, ${JSON.stringify(summary.variantsAtInterface)}; ${unmapped.length} genes with a confident partner left out because their coding coordinates don't map: ${JSON.stringify(unmapped.slice(0, 20))}`,
  )
}

if (import.meta.main) {
  await main()
}
