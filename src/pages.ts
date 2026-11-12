import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { positionRuns } from 'p2s_mapper'

import { readScores } from './alphamissense.ts'
import {
  confidentResidues,
  isConfident,
  isHomodimer,
  modelChain,
  partnerName,
  readAtlas,
} from './atlasData.ts'
import type { AtlasProtein } from './atlasData.ts'
import { downloaded } from './clinvar.ts'
import { readOntology } from './diseases.ts'
import type { Disease, DiseaseOntology, SharedDisease } from './diseases.ts'
import {
  CONSERVATION,
  cachedCodonScores,
  readPatchRanks,
  variantScore,
} from './conservation.ts'
import type { PatchRank } from './conservation.ts'
import { readComparisons, validation } from './experimental.ts'
import type { Comparison } from './experimental.ts'
import type { ScoredVariant } from './analyze.ts'
import {
  CONFIDENT,
  CONTACT,
  LABELS,
  MIN_PLDDT,
  alphaMissenseEvidence,
} from './constants.ts'
import { codingPositions } from './coordinates.ts'
import type { CodingPositions } from './coordinates.ts'
import { readCrossrefs } from './crossrefs.ts'
import type { Complex } from './crossrefs.ts'
import { pairKey, readInteractions, readSources } from './interactions.ts'
import type { PairEvidence } from './interactions.ts'
import { readJson, record, writeJson } from './json.ts'
import { pythonRound } from './numeric.ts'
import { OUT, SITE_DATA } from './paths.ts'
import { diseaseFeatures, humanContexts, humanDiseases } from './uniprot.ts'
import { pairCaution } from './pairs.ts'
import type { ProteinContext } from './pairs.ts'
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
      const points = variants.flatMap(v =>
        v.label === label && v.alphaMissense !== undefined
          ? [alphaMissenseEvidence(v.alphaMissense).points]
          : [],
      )
      return [
        label,
        {
          scored: points.length,
          pp3: points.filter(n => n > 0).length,
          bp4: points.filter(n => n < 0).length,
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

function rounded(value: number | undefined) {
  return value === undefined ? undefined : pythonRound(value, 2)
}

function stringPair(own: string | undefined, partner: string | undefined) {
  return own && partner
    ? ([own, partner] satisfies [string, string])
    : undefined
}

export function geneRecord(
  protein: AtlasProtein,
  variants: ScoredVariant[],
  coding: Pick<CodingPositions, 'chrom' | 'strand' | 'start' | 'end'>,
  scores = new Map<string, number>(),
  experiments = new Map<string, Comparison>(),
  chains = new Map<string, string | undefined>(),
  features: Feature[] = [],
  patchRanks = new Map<string, PatchRank>(),
  contexts = new Map<string, ProteinContext>(),
  sharedDiseases = (_variant: Variant, _partner: string): SharedDisease[] => [],
  interactions = new Map<string, PairEvidence>(),
  crossrefs = {
    complexes: new Map<string, Complex[]>(),
    string: new Map<string, string>(),
  },
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
        complexes: complex.partner
          ? (crossrefs.complexes.get(
              pairKey(protein.accession, complex.partner),
            ) ?? [])
          : [],
        string: stringPair(
          crossrefs.string.get(protein.accession),
          complex.partner && complex.partner !== protein.accession
            ? crossrefs.string.get(complex.partner)
            : undefined,
        ),
        reported: complex.partner
          ? interactions.get(pairKey(protein.accession, complex.partner))
          : undefined,
        conserved: patchRanks.get(complex.entity),
        homodimer: isHomodimer(protein, complex),
        ...pairCaution(
          contexts.get(protein.accession),
          complex.partner && !isHomodimer(protein, complex)
            ? contexts.get(complex.partner)
            : undefined,
        ),
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
            phylop: rounded(variant.phylop),
            position: variant.position,
            partners: [...new Set(names)].sort(),
            partnerDiseases: partners.flatMap(partner =>
              variant.label !== 'benign' &&
              names.includes(partner.gene) &&
              partner.accession &&
              !partner.homodimer
                ? sharedDiseases(variant, partner.accession).map(shared => ({
                    partner: partner.gene,
                    ...shared,
                  }))
                : [],
            ),
            variation: variant.variation,
            review: variant.review,
            chrom: variant.chrom,
            pos: variant.pos,
            allele: variant.allele,
            conditions: variant.conditions,
            diseases: variant.diseases,
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
      const touched = gene.partners.filter(p =>
        variant.partners.includes(p.gene),
      )
      const linked = new Set(variant.partnerDiseases.map(d => d.partner))
      const partner =
        touched.find(p => !p.apart && linked.has(p.gene)) ??
        touched.find(p => !p.apart) ??
        touched[0]
      return sameResidue.length && partner
        ? [
            {
              ...variant,
              gene: gene.gene,
              sameResidue,
              evidence: sameResidue.includes(variant.change) ? 'PS1' : 'PM5',
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
              apart: touched.every(p => p.apart),
            },
          ]
        : []
    })
}

type Partner = ReturnType<typeof geneRecord>['partners'][number]

export function diseaseRecords(
  genes: GenePage[],
  ontology: Pick<DiseaseOntology, 'concepts' | 'name' | 'size' | 'isSeries'>,
  uniprotDiseases: Map<string, Disease[]>,
) {
  const hits = new Map<
    string,
    { gene: GenePage; variant: GenePage['variants'][number] }[]
  >()
  for (const gene of genes) {
    for (const variant of gene.variants) {
      for (const id of ontology.concepts(variant.diseases)) {
        hits.set(id, [...(hits.get(id) ?? []), { gene, variant }])
      }
    }
  }
  const diseaseConcepts = new Map(
    [...uniprotDiseases].map(([accession, diseases]) => [
      accession,
      new Set(ontology.concepts(diseases.map(d => d.omim))),
    ]),
  )
  return [...hits]
    .filter(([, found]) => found.some(h => h.variant.label === 'pathogenic'))
    .map(([id, found]) => {
      const byGene = [...Map.groupBy(found, h => h.gene)]
      return {
        id,
        page: id.replace(':', '_'),
        name: ontology.name(id),
        seriesSize: ontology.isSeries(id) ? ontology.size(id) : undefined,
        genes: byGene
          .map(([gene, own]) => ({
            gene: gene.gene,
            page: gene.page,
            accession: gene.accession,
            partners: new Set(own.flatMap(h => h.variant.partners)).size,
            ...labelCounts(own.map(h => h.variant)),
          }))
          .sort(
            (a, b) => b.pathogenic - a.pathogenic || compare(a.gene, b.gene),
          ),
        pairs: [
          ...Map.groupBy(
            byGene.flatMap(([gene, own]) =>
              gene.partners.flatMap(partner =>
                !partner.homodimer &&
                partner.accession &&
                diseaseConcepts.get(gene.accession)?.has(id) &&
                diseaseConcepts.get(partner.accession)?.has(id)
                  ? [
                      {
                        gene: gene.gene,
                        page: gene.page,
                        key: [gene.accession, partner.accession]
                          .sort()
                          .join(' '),
                        partner: partner.gene,
                        accession: partner.accession,
                        ipsae: partner.ipsae,
                        variants: own
                          .map(h => h.variant)
                          .filter(v => v.partners.includes(partner.gene)),
                      },
                    ]
                  : [],
              ),
            ),
            pair => pair.key,
          ).values(),
        ].flatMap(([first, ...rest]) =>
          first
            ? [
                {
                  gene: first.gene,
                  page: first.page,
                  partner: first.partner,
                  accession: first.accession,
                  ipsae: first.ipsae,
                  ...labelCounts(
                    [first, ...rest].flatMap(side => side.variants),
                  ),
                },
              ]
            : [],
        ),
        variants: found.map(({ gene, variant }) => ({
          gene: gene.gene,
          page: gene.page,
          change: variant.change,
          position: variant.position,
          label: variant.label,
          variation: variant.variation,
          review: variant.review,
          conditions: variant.conditions,
          alphaMissense: variant.alphaMissense,
          partners: variant.partners,
          partnerDiseases: variant.partnerDiseases,
        })),
      }
    })
}

export type DiseasePage = ReturnType<typeof diseaseRecords>[number]

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function distinctPairs(
  genes: { accession: string; partners: Partner[] }[],
  keep: (partner: Partner) => boolean,
) {
  return new Set(
    genes.flatMap(g =>
      g.partners
        .filter(keep)
        .map(p => [g.accession, p.accession].sort().join(' ')),
    ),
  ).size
}

async function main() {
  const proteins = readAtlas().filter(protein =>
    protein.interfaces.some(isConfident),
  )
  const accessions = new Set(proteins.map(p => p.accession))
  const variants = await readVariants(accession => accessions.has(accession))
  const scores = readScores()
  const features = await diseaseFeatures()
  const contexts = await humanContexts()
  const ontology = await readOntology()
  const diseases = await humanDiseases()
  const interactions = readInteractions()
  const crossrefs = readCrossrefs()
  const comparisons = readComparisons()
  const experiments = Map.groupBy(comparisons, pair => pair.accession)
  const analysis = record(readJson(join(OUT, 'analysis.json')))
  const conservation = record(readJson(CONSERVATION))
  const patchRanks = readPatchRanks()
  const mapped = await Promise.all(
    proteins.map(async protein => ({
      protein,
      coding: await codingPositions(protein.accession, protein.length),
    })),
  )
  const genes = mapped.flatMap(({ protein, coding }) => {
    const codons = cachedCodonScores(protein.accession)
    return coding
      ? [
          geneRecord(
            protein,
            (variants.get(protein.accession) ?? []).map(variant => ({
              ...variant,
              phylop: codons && variantScore(variant, coding, codons),
            })),
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
            new Map(
              protein.interfaces.flatMap(complex => {
                const rank = patchRanks.get(
                  `${protein.accession} ${complex.entity}`,
                )
                return rank
                  ? [
                      [
                        complex.entity,
                        {
                          anywhere: rounded(rank.anywhere),
                          nearby: rounded(rank.nearby),
                        },
                      ] satisfies [string, PatchRank],
                    ]
                  : []
              }),
            ),
            contexts,
            (variant, partner) =>
              ontology.shared(variant.diseases, diseases.get(partner) ?? []),
            interactions,
            crossrefs,
          ),
        ]
      : []
  })
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
  const diseasePages = diseaseRecords(pages, ontology, diseases)
  rmSync(join(SITE_DATA, 'diseases'), { recursive: true, force: true })
  for (const disease of diseasePages) {
    writeJson(join(SITE_DATA, 'diseases', `${disease.page}.json`), disease)
  }
  writeJson(
    join(SITE_DATA, 'diseases.json'),
    diseasePages
      .map(d => ({
        id: d.id,
        page: d.page,
        name: d.name,
        seriesSize: d.seriesSize,
        genes: d.genes.length,
        causal: d.genes.flatMap(g => (g.pathogenic ? [g.page] : [])),
        pairs: d.pairs.length,
        ...labelCounts(d.variants),
      }))
      .sort((a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase())),
  )
  const shortlist = pages.flatMap(page =>
    leads(page).map(lead => ({ ...lead, page: page.page })),
  )
  const summaryCounts = record(analysis.summary)
  const controlled = record(analysis.controlled_for_order_and_surface)
  const matched = record(conservation.enrichment)
  const summary = {
    proteins: summaryCounts['disease proteins'],
    withPartner: summaryCounts['with any predicted complex'],
    genes: genes.length,
    unmapped: unmapped.length,
    partners: genes.reduce((n, g) => n + g.partners.length, 0),
    variantsAtInterface: labelCounts(genes.flatMap(g => g.variants)),
    leads: {
      variants: shortlist.length,
      genes: new Set(shortlist.map(lead => lead.page)).size,
      sameChange: shortlist.filter(lead => lead.evidence === 'PS1').length,
      apart: shortlist.filter(lead => lead.apart).length,
    },
    pairs: {
      apart: distinctPairs(genes, p => p.apart),
      paralogs: distinctPairs(genes, p => p.paralogs),
      paralogsWithoutStructure: distinctPairs(
        genes,
        p => p.paralogs && !p.experiment,
      ),
      all: distinctPairs(genes, () => true),
      direct: distinctPairs(genes, p => p.reported?.evidence === 'direct'),
      complex: distinctPairs(genes, p => p.reported?.evidence === 'complex'),
    },
    alphaMissense: {
      calls: alphaMissenseCalls(genes.flatMap(g => g.variants)),
    },
    enrichment: {
      all: controlled['all residues'],
      ordered: controlled['ordered (pLDDT ≥ 70)'],
      orderedSurface: controlled['ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)'],
      byConfidenceBand: analysis.by_confidence_band,
      byAlphaMissenseClass: analysis.by_alphamissense_class,
      byKind: analysis.by_kind,
      byPairEvidence: analysis.by_pair_evidence,
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
    provenance: {
      clinvarDownloaded: downloaded(),
      ...readSources(),
      complexPortalDownloaded: crossrefs.complexPortalDownloaded,
    },
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
