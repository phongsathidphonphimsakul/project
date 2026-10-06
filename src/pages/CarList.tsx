import { useMemo, useState } from 'react'
import { useData } from '../lib/store'
import { daysInStock, todayISO, totalCost } from '../lib/calc'
import { baht, carTitle, signed } from '../lib/format'
import { STATUS_LABEL, STATUS_ORDER, type Car, type CarStatus } from '../lib/types'
import { go } from '../lib/router'
import { Icon } from '../components/ui'

type Filter = 'active' | CarStatus | 'all'
type Sort = 'new' | 'days' | 'cost' | 'profit'

const FILTER_KEY = 'lanrot.list'

function readPrefs(): { filter: Filter; sort: Sort } {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}')
    return { filter: v.filter ?? 'active', sort: v.sort ?? 'new' }
  } catch {
    return { filter: 'active', sort: 'new' }
  }
}

export default function CarList() {
  const { cars, settings } = useData()
  const [q, setQ] = useState('')
  const [prefs, setPrefs] = useState(readPrefs)
  const today = todayISO()

  const update = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p }
    setPrefs(next)
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: cars.length, active: 0 }
    for (const c of cars) {
      m[c.status] = (m[c.status] ?? 0) + 1
      if (c.status !== 'sold') m.active++
    }
    return m
  }, [cars])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '')
    const list = cars
      .filter((c) => (prefs.filter === 'all' ? true : prefs.filter === 'active' ? c.status !== 'sold' : c.status === prefs.filter))
      .filter((c) => {
        if (!needle) return true
        const hay = [c.stockNo, c.brand, c.model, c.subModel, c.year, c.color, c.plate, c.province, c.vin, c.sale?.buyer, c.reservation?.name]
          .join(' ')
          .toLowerCase()
          .replace(/\s+/g, '')
        return hay.includes(needle)
      })
      .map((c) => {
        const cost = totalCost(c)
        const price = c.sale?.price ?? c.askingPrice
        return { c, cost, price, profit: price != null ? price - cost : null, days: daysInStock(c, today) }
      })
    const by: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      new: (a, b) => b.c.createdAt - a.c.createdAt,
      days: (a, b) => b.days - a.days,
      cost: (a, b) => b.cost - a.cost,
      profit: (a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity),
    }
    return list.sort(by[prefs.sort])
  }, [cars, q, prefs, today])

  const sum = rows.reduce((s, r) => s + r.cost, 0)

  return (
    <div className="page">
      <header className="page-head">
        <h1>รถในเต็นท์</h1>
        <button type="button" className="btn btn-primary hide-sm" onClick={() => go('/new')}>
          <Icon name="plus" /> ลงรถคันใหม่
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input type="search" placeholder="ค้นหา ยี่ห้อ รุ่น ทะเบียน เลขสต็อก ชื่อลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="เรียงตาม" value={prefs.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
          <option value="new">ลงล่าสุด</option>
          <option value="days">จอดนานสุด</option>
          <option value="cost">ทุนสูงสุด</option>
          <option value="profit">กำไรสูงสุด</option>
        </select>
      </div>

      <div className="tabs" role="tablist">
        {(['active', ...STATUS_ORDER, 'all'] as Filter[]).map((f) => (
          <button key={f} role="tab" type="button" aria-selected={prefs.filter === f} onClick={() => update({ filter: f })}>
            {f === 'active' ? 'ยังไม่ขาย' : f === 'all' ? 'ทั้งหมด' : STATUS_LABEL[f]}
            <em>{counts[f] ?? 0}</em>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p>{cars.length === 0 ? 'ยังไม่มีรถในระบบ' : 'ไม่พบรถตามเงื่อนไข'}</p>
        </div>
      ) : (
        <>
          <table className="ledger car-table">
            <thead>
              <tr>
                <th>สต็อก</th>
                <th>รถ</th>
                <th>ทะเบียน</th>
                <th>สถานะ</th>
                <th className="num">วัน</th>
                <th className="num">ทุนรวม</th>
                <th className="num">ราคาตั้ง/ขาย</th>
                <th className="num">กำไร</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, cost, price, profit, days }) => (
                <tr key={c.id} onClick={() => go(`/car/${c.id}`)}>
                  <td className="mono">{c.stockNo}</td>
                  <td>
                    <a href={`#/car/${c.id}`} onClick={(e) => e.stopPropagation()} className="car-link">
                      {carTitle(c)}
                    </a>
                    <small className="muted">{[c.color, c.gear, c.mileage != null ? baht(c.mileage) + ' กม.' : ''].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td>{c.plate || <span className="muted">–</span>}</td>
                  <td>
                    <StatusPill s={c.status} />
                  </td>
                  <td className={'num ' + (c.status !== 'sold' && days >= settings.agingWarnDays ? 'warn' : '')}>{days}</td>
                  <td className="num">{baht(cost)}</td>
                  <td className="num">{price != null ? baht(price) : <span className="muted">ยังไม่ตั้ง</span>}</td>
                  <td className={'num ' + (profit == null ? '' : profit >= 0 ? 'pos' : 'neg')}>{profit == null ? '–' : signed(profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>{rows.length} คัน</td>
                <td className="num">{baht(sum)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>

          <ul className="car-cards">
            {rows.map(({ c, cost, price, profit, days }) => (
              <li key={c.id}>
                <CarCard c={c} cost={cost} price={price} profit={profit} days={days} warn={c.status !== 'sold' && days >= settings.agingWarnDays} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function StatusPill({ s }: { s: CarStatus }) {
  return <span className={'status status-' + s}>{STATUS_LABEL[s]}</span>
}

function CarCard({ c, cost, price, profit, days, warn }: { c: Car; cost: number; price: number | null; profit: number | null; days: number; warn: boolean }) {
  return (
    <a href={`#/car/${c.id}`} className="car-card">
      <div className="car-card-thumb">{c.photoUrl ? <img src={c.photoUrl} alt="" loading="lazy" /> : <span>{c.brand || '—'}</span>}</div>
      <div className="car-card-body">
        <div className="car-card-top">
          <span className="mono">{c.stockNo}</span>
          <StatusPill s={c.status} />
        </div>
        <b>{carTitle(c)}</b>
        <small className="muted">
          {[c.plate, c.color].filter(Boolean).join(' · ')}
          <span className={warn ? 'warn' : ''}> · {days} วัน</span>
        </small>
        <div className="car-card-nums">
          <span>
            ทุน <b>{baht(cost)}</b>
          </span>
          <span>
            {c.sale ? 'ขาย' : 'ตั้ง'} <b>{price != null ? baht(price) : '–'}</b>
          </span>
          {profit != null && <span className={profit >= 0 ? 'pos' : 'neg'}>{signed(profit)}</span>}
        </div>
      </div>
    </a>
  )
}
