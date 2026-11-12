import { expect, test } from 'vitest'

import { mappingCheck } from './findings.ts'

test('a variant counts as mapped when it falls inside a block of its interface', () => {
  const interfaces = [
    'chr1\t100\t200\tGENE–PARTNER (ipSAE 0.80)\t800\t+\t100\t200\t0,0,0\t2\t3,6\t0,90',
    'chr1\t100\t200\tGENE–GENE (ipSAE 0.90)\t900\t+\t100\t200\t0,0,0\t1\t3\t30',
  ].join('\n')
  const variants = [
    'chr1\t101\t102\tGENE A1V uncertain; interface with PARTNER\t0\t+\t101\t102\t0,0,0',
    'chr1\t131\t132\tGENE G11R pathogenic; interface with GENE\t0\t+\t131\t132\t0,0,0',
    'chr1\t150\t151\tOTHER L5P pathogenic; interface with PARTNER\t0\t+\t150\t151\t0,0,0',
  ].join('\n')
  expect(mappingCheck(interfaces, variants)).toEqual({
    variants: 3,
    inside: 2,
    outsideGenes: ['OTHER'],
  })
})
