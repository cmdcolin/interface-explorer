export const CLINVAR_TRACK = 'hg38-clinvarMain'
export const PHYLOP_TRACK = 'hg38-phyloP100way'
export const INTERFACE_TRACKS = [
  'hg38-ncbiRefSeqCurated',
  'interfaces',
  'interface-variants',
  CLINVAR_TRACK,
  PHYLOP_TRACK,
]
export const ISOFORM_TRACKS = ['hg38-ncbiRefSeqCurated', CLINVAR_TRACK]
export const GPCR_TRACKS = [
  'hg38-ncbiRefSeqCurated',
  'gpcr-interfaces',
  'gpcr-interface-variants',
  CLINVAR_TRACK,
]

const CONNECTED_TRACKS = INTERFACE_TRACKS.map(trackId =>
  trackId === CLINVAR_TRACK
    ? {
        trackId,
        displaySnapshot: { type: 'LinearMultiRowFeatureDisplay' },
      }
    : trackId,
)

export interface Partner {
  gene: string
  entity: string
}

export interface VariantSite {
  partners: string[]
  chrom: string
  pos: number
  allele?: string
}

export function complexSpec(
  gene: string,
  entity: string,
  loc: string,
  variant?: string,
) {
  return {
    views: [
      {
        type: 'ProteinView',
        gene,
        alphaFoldComplexId: entity,
        ...(variant ? { variant } : {}),
        connectedView: { assembly: 'hg38', loc, tracks: CONNECTED_TRACKS },
      },
    ],
  }
}

export function variantPartner(
  gene: { partners: Partner[] },
  variant: VariantSite,
) {
  return gene.partners.find(p => variant.partners.includes(p.gene))
}

export function variantSpec(
  gene: { gene: string; partners: Partner[] },
  variant: VariantSite,
  partner = variantPartner(gene, variant),
) {
  if (partner) {
    return complexSpec(
      gene.gene,
      partner.entity,
      `chr${variant.chrom}:${variant.pos - 30}-${variant.pos + 30}`,
      `chr${variant.chrom}:${variant.pos}${variant.allele ? ` ${variant.allele}` : ''}`,
    )
  }
  throw new Error(
    `${gene.gene}: the variant at chr${variant.chrom}:${variant.pos} touches none of its partners`,
  )
}

export function pdbSpec(
  gene: string,
  pdbId: string,
  locus?: string | null,
  tracks = GPCR_TRACKS,
) {
  return {
    views: [
      {
        type: 'ProteinView',
        gene,
        pdbId,
        connectedView: {
          assembly: 'hg38',
          ...(locus ? { loc: locus } : {}),
          tracks,
        },
      },
    ],
  }
}

export function isoformSpec(
  record: { gene: string; locus?: string | null },
  transcriptId: string | undefined,
  structures: { url: string }[],
) {
  return {
    views: [
      {
        type: 'ProteinView',
        gene: record.gene,
        ...(transcriptId ? { transcriptId } : {}),
        structures,
        connectedView: {
          assembly: 'hg38',
          ...(record.locus ? { loc: record.locus } : {}),
          tracks: ISOFORM_TRACKS,
        },
      },
    ],
  }
}

export function sessionUrl(spec: object, jbrowse = 'jbrowse/') {
  return `${jbrowse}?session=spec-${encodeURIComponent(JSON.stringify(spec))}`
}

export function locusUrl(loc: string, tracks: string[], jbrowse = 'jbrowse/') {
  return `${jbrowse}?assembly=hg38&loc=${loc}&tracks=${tracks.join(',')}`
}

export function genomeUrl(
  chrom: string,
  start: number,
  end: number,
  jbrowse = 'jbrowse/',
) {
  return locusUrl(`chr${chrom}:${start}-${end}`, INTERFACE_TRACKS, jbrowse)
}

export function geneLocus(gene: { start: number; end: number; chrom: string }) {
  const pad = Math.round((gene.end - gene.start) * 0.05) + 200
  return `chr${gene.chrom}:${gene.start - pad}-${gene.end + pad}`
}
