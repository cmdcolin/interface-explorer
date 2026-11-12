import { describe, expect, it } from 'vitest'
import {
  architectureDot,
  architectureSvg,
  columns,
  COLUMNS,
  edges,
  nodes,
} from './architecture.ts'

const numbers = { proteins: 1000, contact: 5, ipsae: 0.5, plddt: 70 }
const ids = nodes(numbers).map(node => node.id)

describe('architecture graph', () => {
  it('has a heading for every column', () => {
    expect(COLUMNS).toHaveLength(columns.length)
  })

  it('places every node in exactly one column', () => {
    expect([...columns.flat()].sort()).toEqual([...ids].sort())
  })

  it('has unique node ids', () => {
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only connects nodes that exist', () => {
    const known = new Set(ids)
    expect(
      edges.filter(edge => !known.has(edge.from) || !known.has(edge.to)),
    ).toEqual([])
  })

  it('writes every node into the DOT source', () => {
    const dot = architectureDot(numbers)
    expect(ids.filter(id => !dot.includes(`${id} [`))).toEqual([])
  })

  it('labels every stage', () => {
    const svg = architectureSvg(numbers)
    expect(
      COLUMNS.filter(heading => !svg.includes(`>${heading}</text>`)),
    ).toEqual([])
  })

  it('returns a bare svg element with no prolog or node titles', () => {
    const svg = architectureSvg(numbers)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<title>')
  })
})
