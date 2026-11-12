import { join } from 'node:path'

import { positionRuns } from 'p2s_mapper'

import {
  isLikelyPathogenic,
  LIKELY_BENIGN,
  LIKELY_PATHOGENIC,
  readScores,
} from './alphamissense.ts'
import {
  confidentResidues,
  isConfident,
  modelChain,
  partnerName,
  readAtlas,
} from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { downloaded } from './clinvar.ts'
import { CONSERVATION } from './conservation.ts'
import { readComparisons, validation } from './experimental.ts'
import type { Comparison } from './experimental.ts'
import { CONFIDENT, CONTACT, LABELS, MIN_PLDDT } from './constants.ts'
import { codingPositions } from './coordinates.ts'
import type { CodingPositions } from './coordinates.ts'
import { readJson, record, writeJson } from './json.ts'
import { OUT, SITE_DATA } from './paths.ts'
import { diseaseFeatures } from './uniprot.ts'
import type { Feature } from './uniprot.ts'
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
  const count = (label: Variant['label']) =>
    variants.filter(v => v.label === label).length
  return {
    pathogenic: count('pathogenic'),
    uncertain: count('uncertain'),
    benign: count('benign'),
  }
}

export function alphaMissenseCalls(
  variants: { label: Variant['label']; alphaMissense?: number }[],
) {
  return Object.fromEntries(
    LABELS.map(label => {
      const scored = variants.filter(
        v => v.label === label && v.alphaMissense !== undefined,
      )
      return [
        label,
        {
          scored: scored.length,
          likelyPathogenic: scored.filter(v =>
            isLikelyPathogenic(v.alphaMissense),
          ).length,
        },
      ]
    }),
  )
}

function experimentOf(comparison: Comparison | undefined) {
  return comparison
    ? {
        pdb: comparison.pdb,
        experimental: comparison.experimental,
        predicted: comparison.predicted,
        shared: comparison.shared,
      }
    : undefined
}

export function geneRecord(
  protein: AtlasProtein,
  variants: Variant[],
  coding: Pick<CodingPositions, 'chrom' | 'strand' | 'start' | 'end'>,
  scores = new Map<string, number>(),
  experiments = new Map<string, Comparison>(),
  chains = new Map<string, string | undefined>(),
  features: Feature[] = [],
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
        modelledAs: complex.modelled_as,
        ipsae: complex.ipsae,
        iptm: complex.iptm,
        pdockq: complex.pdockq,
        entity: complex.entity,
        chain: chains.get(complex.entity),
        residues: residues.length,
        runs: runs(residues),
        experiment: experimentOf(experiments.get(complex.entity)),
      }
    })
  const atInterface = variants.flatMap(variant => {
    const names = atResidue.get(variant.position)
    return names
      ? [
          {
            change: variant.change,
            label: variant.label,
            alphaMissense: scores.get(variant.change),
            position: variant.position,
            partners: [...new Set(names)].sort(),
            variation: variant.variation,
            review: variant.review,
            chrom: variant.chrom,
            pos: variant.pos,
            allele: variant.allele,
            conditions: variant.conditions,
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
    features,
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
    totals: labelCounts(variants),
    interfaceResidues: atResidue.size,
    counts: labelCounts(atInterface),
  }
}

export type GenePage = ReturnType<typeof geneRecord> & { page: string }

export function leads(gene: ReturnType<typeof geneRecord>) {
  const pathogenic = gene.variants.filter(v => v.label === 'pathogenic')
  return gene.variants
    .filter(v => v.label === 'uncertain')
    .flatMap(variant => {
      const known = pathogenic.filter(p => p.position === variant.position)
      const sameResidue = [...new Set(known.map(p => p.change))]
      const partner = gene.partners.find(p => variant.partners.includes(p.gene))
      return sameResidue.length && partner
        ? [
            {
              ...variant,
              gene: gene.gene,
              sameResidue,
              knownConditions: [...new Set(known.flatMap(p => p.conditions))],
              pathogenicResidues: new Set(
                pathogenic
                  .filter(
                    p =>
                      p.position !== variant.position &&
                      p.partners.some(name => variant.partners.includes(name)),
                  )
                  .map(p => p.position),
              ).size,
              partner: partner.gene,
              entity: partner.entity,
            },
          ]
        : []
    })
}

async function main() {
  const proteins = readAtlas().filter(protein =>
    protein.interfaces.some(isConfident),
  )
  const accessions = new Set(proteins.map(p => p.accession))
  const variants = await readVariants(accession => accessions.has(accession))
  const scores = readScores()
  const features = await diseaseFeatures()
  const comparisons = readComparisons()
  const experiments = Map.groupBy(comparisons, pair => pair.accession)
  const analysis = record(readJson(join(OUT, 'analysis.json')))
  const conservation = record(readJson(CONSERVATION))
  const mapped = await Promise.all(
    proteins.map(async protein => ({
      protein,
      coding: await codingPositions(protein.accession, protein.length),
    })),
  )
  const genes = mapped.flatMap(({ protein, coding }) =>
    coding
      ? [
          geneRecord(
            protein,
            variants.get(protein.accession) ?? [],
            coding,
            scores.get(protein.accession),
            new Map(
              experiments
                .get(protein.accession)
                ?.map(pair => [pair.entity, pair]),
            ),
            new Map(
              protein.interfaces.map(complex => [
                complex.entity,
                modelChain(complex.entity, protein.accession),
              ]),
            ),
            features.get(protein.accession),
          ),
        ]
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
  const shortlist = pages.flatMap(page =>
    leads(page).map(lead => ({ ...lead, page: page.page })),
  )
  const summaryCounts = record(analysis.summary)
  const controlled = record(analysis.controlled_for_order_and_surface)
  const matched = record(conservation.enrichment)
  const summary = {
    proteins: summaryCounts['disease proteins'],
    withPartner: summaryCounts['with any predicted hetero complex'],
    genes: genes.length,
    unmapped: unmapped.length,
    partners: genes.reduce((n, g) => n + g.partners.length, 0),
    variantsAtInterface: labelCounts(genes.flatMap(g => g.variants)),
    leads: {
      variants: shortlist.length,
      genes: new Set(shortlist.map(lead => lead.page)).size,
    },
    alphaMissense: {
      calls: alphaMissenseCalls(genes.flatMap(g => g.variants)),
      likelyBenign: LIKELY_BENIGN,
      likelyPathogenic: LIKELY_PATHOGENIC,
    },
    enrichment: {
      all: controlled['all residues'],
      ordered: controlled['ordered (pLDDT ≥ 70)'],
      orderedSurface: controlled['ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)'],
      byConfidenceBand: analysis.by_confidence_band,
      byAlphaMissenseClass: analysis.by_alphamissense_class,
    },
    conservation: {
      variants: conservation.variants,
      enrichment: {
        all: matched['all residues'],
        orderedSurface: matched['ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)'],
      },
      residues: conservation.residues,
    },
    validation: validation(comparisons),
    thresholds: { ipsae: CONFIDENT, plddt: MIN_PLDDT, contact: CONTACT },
    provenance: { clinvarDownloaded: downloaded() },
  }
  writeJson(join(SITE_DATA, 'genes.json'), index)
  writeJson(join(SITE_DATA, 'leads.json'), shortlist)
  writeJson(join(SITE_DATA, 'summary.json'), summary)
  console.log(
    `${genes.length} gene pages, ${summary.partners} partners, ${JSON.stringify(summary.variantsAtInterface)}; ${unmapped.length} genes with a confident partner left out because their coding coordinates don't map: ${JSON.stringify(unmapped.slice(0, 20))}`,
  )
}

if (import.meta.main) {
  await main()
}
