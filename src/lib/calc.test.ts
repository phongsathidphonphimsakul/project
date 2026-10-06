import { describe, expect, it } from 'vitest'
import { daysBetween, installment, maxBuyPrice, profitAt, quote, roundPrice, targetPrice, totalCost } from './calc'

describe('roundPrice', () => {
  it('rounds up to step', () => {
    expect(roundPrice(351_200, '1000')).toBe(352_000)
    expect(roundPrice(351_200, '5000')).toBe(355_000)
    expect(roundPrice(351_200, '10000')).toBe(360_000)
    expect(roundPrice(350_000, '10000')).toBe(350_000)
  })
  it('ends with 9,000', () => {
    expect(roundPrice(351_200, 'end9')).toBe(359_000)
    expect(roundPrice(359_000, 'end9')).toBe(359_000)
    expect(roundPrice(359_001, 'end9')).toBe(369_000)
    expect(roundPrice(4_000, 'end9')).toBe(9_000)
  })
})

describe('targetPrice', () => {
  it('markup is % of cost', () => {
    expect(targetPrice(300_000, 'markup', 20)).toBeCloseTo(360_000)
  })
  it('margin is % of price', () => {
    expect(targetPrice(300_000, 'margin', 20)).toBeCloseTo(375_000)
    expect(targetPrice(300_000, 'margin', 100)).toBeNaN()
  })
  it('profit adds baht', () => {
    expect(targetPrice(300_000, 'profit', 45_000)).toBe(345_000)
  })
})

describe('quote', () => {
  it('adds negotiation buffer on top of floor', () => {
    const q = quote(312_500, { mode: 'profit', value: 40_000, buffer: 10_000, rounding: 'end9' })
    expect(q.floor).toBe(359_000)
    expect(q.list).toBe(369_000)
    expect(q.profitAtFloor).toBe(46_500)
  })
})

describe('totalCost', () => {
  it('sums purchase and expenses', () => {
    expect(
      totalCost({
        purchasePrice: 250_000,
        expenses: [
          { id: 'a', category: 'x', label: '', amount: 12_000, date: '', vendor: '' },
          { id: 'b', category: 'x', label: '', amount: 3_500, date: '', vendor: '' },
        ],
      }),
    ).toBe(265_500)
  })
})

describe('profitAt', () => {
  it('reports markup and margin', () => {
    const v = profitAt(400_000, 320_000)
    expect(v.profit).toBe(80_000)
    expect(v.markupPct).toBeCloseTo(25)
    expect(v.marginPct).toBeCloseTo(20)
  })
})

describe('installment', () => {
  it('flat rate with VAT', () => {
    // ยอดจัด 400k, 3% ต่อปี 60 งวด → 400k*1.15/60 = 7,666.67 ×1.07 = 8,203.33
    const r = installment(500_000, 20, 3, 60, true)
    expect(r.down).toBe(100_000)
    expect(r.financed).toBe(400_000)
    expect(r.monthly).toBe(8_204)
  })
})

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59)
    expect(daysBetween('', '2026-03-01')).toBe(0)
  })
})

describe('maxBuyPrice', () => {
  it('inverts each pricing mode', () => {
    expect(maxBuyPrice(400_000, 30_000, 'profit', 50_000)).toBe(320_000)
    expect(maxBuyPrice(345_000, 45_000, 'markup', 15)).toBe(255_000)
    expect(maxBuyPrice(400_000, 20_000, 'margin', 20)).toBe(300_000)
  })
})
