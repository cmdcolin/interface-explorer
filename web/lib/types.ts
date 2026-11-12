import type { GenePage, leads } from '../../src/pages.ts'

export type Label = 'pathogenic' | 'uncertain' | 'benign'

export type Gene = GenePage
export type GeneVariant = Gene['variants'][number]
export type Feature = Gene['features'][number]
export type Lead = ReturnType<typeof leads>[number] & { page: string }

export interface GeneRow {
  gene: string
  page: string
  accession: string
  partners: number
  topPartner: string
  bestIpsae: number
  interfaceResidues: number
  length: number
  pathogenic: number
  uncertain: number
  benign: number
}

export interface Enrichment {
  'proteins informative': number
  'pathogenic at interface': string
  'benign at interface': string
  'Mantel–Haenszel odds ratio': number
  '95% CI (bootstrap over proteins)': [number, number]
}

export interface ConservationMatch {
  unmatched: Enrichment
  matched: Enrichment
}

export interface ResidueConservation {
  complexes: number
  'interface more conserved': number
  'median difference': number
}

export interface PatchCount {
  interface: number
  fake: number
}

export interface PatchConservation {
  complexes: number
  'above the median patch': PatchCount
  'above 95% of patches': PatchCount
  'median percentile': number
}

export interface PatchTest {
  all: PatchConservation
  byConfidenceBand: Record<string, PatchConservation>
}

export interface Validation {
  pairs: number
  touching: number
  recall: number
  precision: number
  recovered: number
  histogram: number[]
}

export interface Summary {
  proteins: number
  withPartner: number
  genes: number
  unmapped: number
  partners: number
  variantsAtInterface: Record<Label, number>
  leads: { variants: number; genes: number; sameChange: number }
  alphaMissense: {
    calls: Record<Label, { scored: number; pp3: number; bp4: number }>
  }
  enrichment: {
    all: Enrichment
    ordered: Enrichment
    orderedSurface: Enrichment
    byConfidenceBand: Record<string, Enrichment>
    byAlphaMissenseClass: Record<string, Enrichment>
  }
  conservation: {
    variants: {
      scored: number
      edges: number[]
      quartiles: Record<Label, number>[]
    }
    enrichment: Record<'all' | 'orderedSurface', ConservationMatch>
    residues: {
      all: ResidueConservation
      byConfidenceBand: Record<string, ResidueConservation>
      patches: PatchTest
      nearbyPatches: PatchTest
    }
  }
  validation: { cutoff: string; all: Validation; unseen: Validation }
  thresholds: { ipsae: number; plddt: number; contact: number }
  provenance: { clinvarDownloaded: string }
}

export interface IsoformRow {
  gene: string
  page: string
  accession: string
  described: number
  modelled: number
  shortest: number
  length: number
  foldedChanged: number
  unfolded: number
  pathogenicLost: number
  interfaceLost: number
}

export interface IsoformIndex {
  checked: number
  described: number
  genes: IsoformRow[]
}

export interface IsoformTotals {
  genes: number
  alternativeIsoforms: number
  lackingInterface: number
  genesLackingPathogenic: number
}

export interface Edit {
  start: number
  end: number
  original?: string
  replacement: string
}

export interface Isoform {
  accession: string
  name?: string
  model: string
  cif: string
  length: number
  meanPlddt: number
  plddt: [number, number][]
  segments: [number, number, number][]
  edits: Edit[]
  refseq: string[]
  foldedChanged: number
  unfolded: number
  pathogenicLost: number[]
  pathogenicChanges: string[]
  interfaceLost: Record<string, [number, number]>
}

export interface IsoformRecord {
  gene: string
  page: string
  accession: string
  length: number
  locus?: string | null
  described: number
  canonical: {
    accession: string
    name?: string
    model: string
    cif: string
    meanPlddt: number
    plddt: [number, number][]
    refseq: string[]
  }
  pathogenic?: number[]
  interface?: number[]
  isoforms: Isoform[]
}

export interface SideVariant {
  change: string
  label: Label
  position: number
  variation: number
}

export interface Side {
  gene: string
  accession: string
  identity: number
  residues: number[]
  chain: string
  auth: Record<string, number>
  differing: number[]
  chimera: boolean
  locus: string | null
  variants: SideVariant[]
  generic?: Record<string, string>
}

export interface Agreement {
  partner: string
  predicted: number
  shared: number
  recall: number
  precision: number
}

export interface PredictedGAlpha extends Agreement {
  accession: string
  experimental: number[]
  predictedResidues: number[]
  receptors: Agreement[]
}

export interface Complex {
  pdb: string
  method: string
  resolution: string
  state: string
  species: string
  g_family: string
  g_subtype: string
  g_note: string
  dataset: string
  receptor: string
  receptorSide: Side & { afdb: Agreement | null }
  gProteins: Side[]
  gAlphaAfdb: PredictedGAlpha | null
  axis: number[]
}

export interface GAlpha {
  gene: string
  accession: string
  length: number
  locus: string | null
  counts: [number, number][]
  receptors: string[]
  structures: number
  chimeraOnly: boolean
  afdbReceptors: string[]
  afdb: Agreement | null
  variants: SideVariant[]
}

export interface OtherStructure {
  pdb: string
  method: string
  resolution: string
  state: string
  species: string
  receptor: string
  gene: string
  degree_active: string
}

export interface Gpcr {
  complexes: Complex[]
  gAlphas: GAlpha[]
  others: OtherStructure[]
}

export interface ViralContact {
  accession: string
  gene: string
  length: number
  viral: string
  viralName: string
  protein: string
  pdb: string
  firstDeposited: string
  tried: string[]
  fusions: string[]
  reagent: string | null
  residues: number[]
  viralResidues: number[]
  viralNumbers: number[]
  neighbours: string[]
  variants: (SideVariant & {
    alphaMissense: number | null
    conditions: string[]
  })[]
}

export interface Viral {
  summary: Record<string, number | unknown[]>
  contacts: ViralContact[]
  reagents: ViralContact[]
  apart: {
    gene: string
    accession: string
    protein: string
    tried: string[]
    fusions: string[]
    neighbours: string[]
  }[]
}
