const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export const baht = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '–' : nf.format(Math.round(n)))
export const pct = (n: number) => (Number.isFinite(n) ? nf1.format(n) + '%' : '–')
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + baht(Math.abs(n))

/** ตัวเลขย่อสำหรับการ์ดสรุป: 1.25 ล้าน / 845k */
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return (n / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' ล.'
  return baht(n)
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`
}

export function thaiMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`
}

export function carTitle(c: { brand: string; model: string; subModel?: string; year: number | null }): string {
  const name = [c.brand, c.model, c.subModel].filter(Boolean).join(' ')
  return (name || 'ไม่ระบุรุ่น') + (c.year ? ` ปี ${c.year}` : '')
}

/** แปลงข้อความที่ผู้ใช้พิมพ์ เช่น "350,000" หรือ "35k" เป็นตัวเลข */
export function parseNum(s: string): number {
  const t = s.replace(/[,\s฿บาท]/g, '').toLowerCase()
  if (!t) return NaN
  const m = t.match(/^(-?\d*\.?\d+)(k|m|ล)?$/)
  if (!m) return NaN
  const n = parseFloat(m[1])
  if (m[2] === 'k') return n * 1_000
  if (m[2] === 'm' || m[2] === 'ล') return n * 1_000_000
  return n
}
