import { useMemo, useState } from 'react'
import { useData } from '../lib/store'
import { daysInStock, todayISO, totalCost } from '../lib/calc'
import { baht, carTitle, compact, signed, thaiMonth } from '../lib/format'
import { STATUS_LABEL, type Car } from '../lib/types'
import { go } from '../lib/router'
import { Icon } from '../components/ui'

function monthKey(iso: string) {
  return iso.slice(0, 7)
}

function lastMonths(n: number): string[] {
  const d = new Date()
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export default function Dashboard() {
  const { cars, settings } = useData()
  const today = todayISO()

  const stats = useMemo(() => {
    const unsold = cars.filter((c) => c.status !== 'sold')
    const sold = cars.filter((c) => c.status === 'sold' && c.sale)
    const capital = unsold.reduce((s, c) => s + totalCost(c), 0)
    const priced = unsold.filter((c) => c.askingPrice)
    const expected = priced.reduce((s, c) => s + (c.askingPrice! - totalCost(c)), 0)
    const thisMonth = sold.filter((c) => monthKey(c.sale!.date) === monthKey(today))
    const monthProfit = thisMonth.reduce((s, c) => s + c.sale!.price - totalCost(c), 0)
    const monthRevenue = thisMonth.reduce((s, c) => s + c.sale!.price, 0)
    const avgDays = sold.length ? sold.reduce((s, c) => s + daysInStock(c), 0) / sold.length : null
    const aging = unsold
      .map((c) => ({ car: c, days: daysInStock(c, today) }))
      .filter((x) => x.days >= settings.agingWarnDays)
      .sort((a, b) => b.days - a.days)
    const unpriced = unsold.filter((c) => !c.askingPrice)
    const byStatus = (['stock', 'prep', 'ready', 'reserved'] as const).map((s) => ({ s, n: unsold.filter((c) => c.status === s).length }))
    const months = lastMonths(6).map((m) => {
      const list = sold.filter((c) => monthKey(c.sale!.date) === m)
      return { m, n: list.length, profit: list.reduce((s, c) => s + c.sale!.price - totalCost(c), 0) }
    })
    return { unsold, capital, priced, expected, thisMonth, monthProfit, monthRevenue, avgDays, aging, unpriced, byStatus, months }
  }, [cars, settings.agingWarnDays, today])

  if (cars.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>ภาพรวม</h1>
        </header>
        <div className="empty">
          <h2>ยังไม่มีรถในระบบ</h2>
          <p>เริ่มจากลงรถคันแรก ใส่ราคาที่ซื้อมา แล้วค่อยๆ ลงค่าซ่อม ค่าทำสี ค่าโอน ระบบจะรวมต้นทุนและแนะนำราคาขายให้</p>
          <button type="button" className="btn btn-primary" onClick={() => go('/new')}>
            <Icon name="plus" /> ลงรถคันแรก
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>ภาพรวม</h1>
        <span className="muted">{new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</span>
      </header>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">รถในเต็นท์</span>
          <span className="kpi-value">{stats.unsold.length}</span>
          <span className="kpi-sub">
            {stats.byStatus
              .filter((x) => x.n)
              .map((x) => `${STATUS_LABEL[x.s]} ${x.n}`)
              .join(' · ') || '—'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">เงินทุนจมในสต็อก</span>
          <span className="kpi-value">{compact(stats.capital)}</span>
          <span className="kpi-sub">ราคาซื้อ + ค่าใช้จ่ายทั้งหมด</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">กำไรที่รออยู่</span>
          <span className={'kpi-value ' + (stats.expected >= 0 ? 'pos' : 'neg')}>{signed(stats.expected)}</span>
          <span className="kpi-sub">
            ถ้าขายได้ตามราคาตั้ง · {stats.priced.length}/{stats.unsold.length} คันตั้งราคาแล้ว
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">กำไรเดือนนี้</span>
          <span className={'kpi-value ' + (stats.monthProfit >= 0 ? 'pos' : 'neg')}>{signed(stats.monthProfit)}</span>
          <span className="kpi-sub">
            ขาย {stats.thisMonth.length} คัน · ยอดขาย {compact(stats.monthRevenue)}
            {stats.avgDays != null && ` · เฉลี่ยขายได้ใน ${Math.round(stats.avgDays)} วัน`}
          </span>
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>กำไรจากรถที่ขายได้ 6 เดือนล่าสุด</h2>
          </header>
          {stats.months.some((x) => x.n) ? <ProfitChart months={stats.months} /> : <p className="muted pad">ยังไม่มีรถที่ขายได้ในช่วง 6 เดือนนี้ — กด "ขายแล้ว" ในหน้ารถเพื่อบันทึกการขาย</p>}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>ต้องจัดการ</h2>
          </header>
          {stats.aging.length === 0 && stats.unpriced.length === 0 ? (
            <p className="muted pad">ไม่มีรถค้างนานหรือยังไม่ตั้งราคา</p>
          ) : (
            <ul className="todo">
              {stats.aging.slice(0, 6).map(({ car, days }) => (
                <TodoRow key={car.id} car={car} tag={`จอด ${days} วัน`} tone={days >= settings.agingWarnDays * 1.5 ? 'neg' : 'warn'} />
              ))}
              {stats.unpriced.slice(0, 6).map((car) => (
                <TodoRow key={car.id + 'p'} car={car} tag="ยังไม่ตั้งราคา" tone="muted" />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function TodoRow({ car, tag, tone }: { car: Car; tag: string; tone: 'neg' | 'warn' | 'muted' }) {
  return (
    <li>
      <a href={`#/car/${car.id}`}>
        <span className="mono stock">{car.stockNo}</span>
        <span className="todo-name">{carTitle(car)}</span>
        <span className={'pill pill-' + tone}>{tag}</span>
      </a>
    </li>
  )
}

function ProfitChart({ months }: { months: { m: string; n: number; profit: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = 200
  const pad = { t: 16, r: 8, b: 28, l: 8 }
  const max = Math.max(...months.map((x) => x.profit), 0)
  const min = Math.min(...months.map((x) => x.profit), 0)
  const span = max - min || 1
  const y = (v: number) => pad.t + ((max - v) / span) * (H - pad.t - pad.b)
  const slot = (W - pad.l - pad.r) / months.length
  const bw = Math.min(36, slot * 0.5)
  const zero = y(0)
  const total = months.reduce((s, x) => s + x.profit, 0)

  return (
    <div className="chart">
      <p className="chart-total">
        รวม <b className={total >= 0 ? 'pos' : 'neg'}>{signed(total)}</b> บาท · {months.reduce((s, x) => s + x.n, 0)} คัน
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟกำไรรายเดือน">
        <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} className="axis" />
        {months.map((x, i) => {
          const cx = pad.l + slot * i + slot / 2
          const top = Math.min(y(x.profit), zero)
          const h = Math.max(Math.abs(y(x.profit) - zero), x.n ? 2 : 0)
          const neg = x.profit < 0
          return (
            <g key={x.m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && (
                <path
                  className={neg ? 'bar bar-neg' : 'bar'}
                  d={barPath(cx - bw / 2, top, bw, h, neg)}
                  opacity={hover == null || hover === i ? 1 : 0.45}
                />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="tick">
                {thaiMonth(x.m)}
              </text>
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%` }}>
          <b>{thaiMonth(months[hover].m)}</b>
          <span>
            {months[hover].n} คัน · กำไร {baht(months[hover].profit)}
          </span>
        </div>
      )}
      <table className="sr-only">
        <caption>กำไรรายเดือน</caption>
        <tbody>
          {months.map((x) => (
            <tr key={x.m}>
              <th>{thaiMonth(x.m)}</th>
              <td>{x.n} คัน</td>
              <td>{baht(x.profit)} บาท</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** แท่งกราฟปลายมน 4px ด้านที่ห่างจากเส้นศูนย์ */
function barPath(x: number, y: number, w: number, h: number, down: boolean) {
  const r = Math.min(4, h, w / 2)
  if (!down) return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
  return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`
}
