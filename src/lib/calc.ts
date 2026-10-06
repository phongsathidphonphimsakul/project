import type { Car, PricingPlan, Rounding } from './types'

export function expenseTotal(car: Pick<Car, 'expenses'>): number {
  return car.expenses.reduce((s, e) => s + (e.amount || 0), 0)
}

export function totalCost(car: Pick<Car, 'expenses' | 'purchasePrice'>): number {
  return (car.purchasePrice || 0) + expenseTotal(car)
}

/** ปัดขึ้นเสมอ เพื่อไม่ให้กำไรต่ำกว่าที่ตั้งไว้ */
export function roundPrice(price: number, rounding: Rounding): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  switch (rounding) {
    case 'none':
      return Math.ceil(price)
    case '1000':
    case '5000':
    case '10000': {
      const step = Number(rounding)
      return Math.ceil(price / step) * step
    }
    case 'end9': {
      // ราคาลงท้ายด้วย 9,000 เช่น 359,000 / 429,000
      const k = Math.ceil((price - 9000) / 10000)
      return Math.max(k, 0) * 10000 + 9000
    }
  }
}

/** ราคาขั้นต่ำที่ทำให้ได้กำไรตามเป้า (ยังไม่ปัด ไม่บวกเผื่อต่อ) */
export function targetPrice(cost: number, mode: PricingPlan['mode'], value: number): number {
  if (cost <= 0 && mode !== 'profit') return 0
  switch (mode) {
    case 'markup':
      return cost * (1 + value / 100)
    case 'margin':
      if (value >= 100) return NaN
      return cost / (1 - value / 100)
    case 'profit':
      return cost + value
  }
}

export interface PriceQuote {
  cost: number
  floor: number // ราคาต่ำสุดที่ยังได้กำไรตามเป้า (ปัดแล้ว)
  list: number // ราคาตั้งขาย = floor + เผื่อต่อ แล้วปัด
  profitAtList: number
  profitAtFloor: number
  valid: boolean
}

export function quote(cost: number, plan: PricingPlan): PriceQuote {
  const raw = targetPrice(cost, plan.mode, plan.value)
  const valid = Number.isFinite(raw) && raw > 0
  const floor = valid ? roundPrice(raw, plan.rounding) : 0
  const list = valid ? roundPrice(raw + Math.max(plan.buffer, 0), plan.rounding) : 0
  return {
    cost,
    floor,
    list,
    profitAtList: list - cost,
    profitAtFloor: floor - cost,
    valid,
  }
}

export interface ProfitView {
  profit: number
  markupPct: number // กำไร / ต้นทุน
  marginPct: number // กำไร / ราคาขาย
}

export function profitAt(price: number, cost: number): ProfitView {
  const profit = price - cost
  return {
    profit,
    markupPct: cost > 0 ? (profit / cost) * 100 : 0,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
  }
}

/**
 * ค่างวดแบบดอกเบี้ยคงที่ (flat rate) ตามที่ไฟแนนซ์รถในไทยใช้
 * ยอดจัด × (1 + ดอกเบี้ยต่อปี × ปี) ÷ จำนวนงวด  (+VAT 7% ถ้าเลือก)
 */
export function installment(
  price: number,
  downPct: number,
  ratePct: number,
  months: number,
  vat: boolean,
): { down: number; financed: number; monthly: number } {
  const down = Math.round((price * downPct) / 100)
  const financed = Math.max(price - down, 0)
  if (months <= 0) return { down, financed, monthly: 0 }
  const interest = financed * (ratePct / 100) * (months / 12)
  let monthly = (financed + interest) / months
  if (vat) monthly *= 1.07
  return { down, financed, monthly: Math.ceil(monthly) }
}

export function daysBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0
  const a = Date.parse(fromISO + 'T00:00:00')
  const b = Date.parse(toISO + 'T00:00:00')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** จำนวนวันที่รถจอดอยู่ในเต็นท์ (ขายแล้วนับถึงวันขาย) */
export function daysInStock(car: Pick<Car, 'purchaseDate' | 'sale'>, today = todayISO()): number {
  return daysBetween(car.purchaseDate, car.sale?.date || today)
}

/**
 * ประเมินก่อนซื้อ: ถ้าคาดว่าขายได้ sellPrice และต้องใส่ค่าใช้จ่ายอีก expenses
 * ควรซื้อเข้าไม่เกินเท่าไหร่ ถึงจะยังได้กำไรตามเป้า
 */
export function maxBuyPrice(sellPrice: number, expenses: number, mode: PricingPlan['mode'], value: number): number {
  let maxCost: number
  switch (mode) {
    case 'profit':
      maxCost = sellPrice - value
      break
    case 'markup':
      maxCost = sellPrice / (1 + value / 100)
      break
    case 'margin':
      maxCost = sellPrice * (1 - value / 100)
      break
  }
  return Math.floor(maxCost - expenses)
}
