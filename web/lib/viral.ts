import { pdbModel } from './scene.ts'
import { geneRows, viral } from './data.ts'
import type { ViralContact } from './types.ts'

const RIBOSOME = /^RP[LS]|^FAU$/

function count(contacts: ViralContact[], label: string) {
  return contacts.flatMap(c => c.variants.filter(v => v.label === label)).length
}

export function viralContacts() {
  const data = viral()
  const pages = new Map(geneRows().map(row => [row.gene, row.page]))
  const protease = data.contacts.filter(c => c.protein.includes('3C-like'))
  const apart = data.apart
  return {
    ...data,
    genes: new Set(data.contacts.map(c => c.gene)).size,
    pathogenic: count(data.contacts, 'pathogenic'),
    uncertain: count(data.contacts, 'uncertain'),
    benign: count(data.contacts, 'benign'),
    proteaseSites: protease
      .map(c => new Set(c.viralNumbers))
      .reduce((shared, numbers) => shared.intersection(numbers))
      .values()
      .toArray()
      .toSorted((a, b) => a - b),
    ribosomal: apart.filter(pair => RIBOSOME.test(pair.gene)),
    nsp1Neighbours: [
      ...new Set(
        apart
          .filter(pair => pair.protein.endsWith('nsp1'))
          .flatMap(pair => pair.neighbours),
      ),
    ].toSorted(),
    pageOf: (gene: string) => pages.get(gene),
    byGene: (gene: string) => data.contacts.find(c => c.gene === gene),
    lastContact: (gene: string) =>
      Math.max(
        ...(data.contacts.find(c => c.gene === gene)?.residues ?? [0]),
      ),
  }
}

export function contactView(contact: ViralContact | undefined) {
  return contact?.chain && contact.viralChain
    ? {
        partner: {
          gene: contact.protein,
          entity: contact.pdb,
          chain: contact.chain,
          residues: contact.residues,
          side: { residues: contact.viralResidues, variants: [] },
        },
        variants: contact.variants.map(variant => ({
          change: variant.change,
          label: variant.label,
          position: variant.position,
          partners: [contact.protein],
        })),
        model: pdbModel(contact.pdb, contact.viralChain),
      }
    : undefined
}

export function contactSurface(contact: ViralContact) {
  return {
    gene: contact.gene,
    accession: contact.accession,
    length: contact.length,
    locus: null,
    counts: contact.residues.map(
      residue => [residue, 1] satisfies [number, number],
    ),
    receptors: [contact.protein],
    chimeras: 0,
    structures: 1,
    chimeraOnly: false,
    afdbReceptors: [],
    afdb: null,
    variants: contact.variants,
  }
}

export function listed(items: string[]) {
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : (items[0] ?? '')
}

export function runs(residues: number[]) {
  return residues
    .reduce<number[][]>((blocks, residue) => {
      const last = blocks.at(-1)
      if (last && residue === (last.at(-1) ?? 0) + 1) {
        last.push(residue)
      } else {
        blocks.push([residue])
      }
      return blocks
    }, [])
    .map(block =>
      block.length > 1 ? `${block[0]}–${block.at(-1)}` : String(block[0]),
    )
    .join(', ')
}
