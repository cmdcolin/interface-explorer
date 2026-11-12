import { expect, test } from 'vitest'

import { AGREEMENT, leadPartner } from './structure.ts'

test('a gene page opens on a partner that experiment confirms, among those with pathogenic variants', () => {
  expect(
    leadPartner([
      { gene: 'RGL2', pathogenic: 34, agreement: AGREEMENT.contradicted },
      { gene: 'RASA1', pathogenic: 24, agreement: AGREEMENT.unchecked },
      { gene: 'SOS1', pathogenic: 19, agreement: AGREEMENT.confirmed },
      { gene: 'GRB7', pathogenic: 0, agreement: AGREEMENT.confirmed },
    ]),
  ).toBe('SOS1')
})

test('pathogenic variants outrank agreement, and count breaks ties', () => {
  expect(
    leadPartner([
      { gene: 'A', pathogenic: 0, agreement: AGREEMENT.confirmed },
      { gene: 'B', pathogenic: 2, agreement: AGREEMENT.unchecked },
      { gene: 'C', pathogenic: 5, agreement: AGREEMENT.unchecked },
    ]),
  ).toBe('C')
})
