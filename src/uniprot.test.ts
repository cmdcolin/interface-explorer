import { expect, test } from 'vitest'

import { featuresOf } from './uniprot.ts'

test('features keep the drawn types and their ranges', () => {
  expect(
    featuresOf({
      features: [
        {
          type: 'Domain',
          location: { start: { value: 5 }, end: { value: 90 } },
          description: 'SH2',
        },
        {
          type: 'Region',
          location: { start: { value: 157 }, end: { value: 166 } },
          description: 'Interaction with Elongin BC complex',
        },
        {
          type: 'Chain',
          location: { start: { value: 1 }, end: { value: 213 } },
          description: 'von Hippel-Lindau disease tumor suppressor',
        },
        { type: 'Motif', location: { start: { value: 3 } } },
      ],
    }),
  ).toEqual([
    { type: 'Domain', start: 5, end: 90, description: 'SH2' },
    {
      type: 'Region',
      start: 157,
      end: 166,
      description: 'Interaction with Elongin BC complex',
    },
  ])
})
