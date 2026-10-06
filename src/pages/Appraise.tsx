import { useState } from 'react'
import { maxBuyPrice, profitAt } from '../lib/calc'
import { baht, pct, signed } from '../lib/format'
import { EXPENSE_CATEGORIES } from '../lib/constants'
import { useData } from '../lib/store'
import type { PricingMode } from '../lib/types'
import { Field, Icon, MoneyInput, NumInput, Segmented } from '../components/ui'

interface Line {
  id: number
  category: string
  amount: number | null
}

const KEY = 'lanrot.appraise'

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

/** เครื่องคิดเลขตอนไปดูรถ: ควรซื้อไม่เกินเท่าไหร่ (ไม่บันทึกลงฐานข้อมูล) */
export default function Appraise() {
  const { settings } = useData()
  const saved = load()
  const [sell, setSell] = useState<number | null>(saved?.sell ?? null)
  const [lines, setLines] = useState<Line[]>(
    saved?.lines ?? [
      { id: 1, category: 'ค่าโอน', amount: 3_000 },
      { id: 2, category: 'ขัดสี/เคลือบ/ล้าง', amount: 2_500 },
    ],
  )
  const [mode, setMode] = useState<PricingMode>(saved?.mode ?? settings.defaultPricing.mode)
  const [value, setValue] = useState<number>(saved?.value ?? settings.defaultPricing.value)
  const [offer, setOffer] = useState<number | null>(saved?.offer ?? null)

  const persist = (patch: object) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ sell, lines, mode, value, offer, ...patch }))
    } catch {
      /* ignore */
    }
  }

  const exp = lines.reduce((s, l) => s + (l.amount ?? 0), 0)
  const max = sell ? maxBuyPrice(sell, exp, mode, value) : null
  const offerView = sell && offer ? profitAt(sell, offer + exp) : null

  const setL = (next: Line[]) => {
    setLines(next)
    persist({ lines: next })
  }

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>ประเมินก่อนซื้อ</h1>
      </header>
      <p className="lead">ไปดูรถมา คิดว่าขายต่อได้เท่าไหร่ ต้องซ่อมอะไรบ้าง — ระบบจะบอกว่าควรต่อราคาซื้อให้ไม่เกินเท่าไหร่</p>

      <section className="panel">
        <div className="pad stack">
          <Field label="คาดว่าจะขายต่อได้" hint="ดูจากราคาตลาดรุ่นเดียวกัน">
            {(id) => (
              <MoneyInput
                id={id}
                value={sell}
                allowEmpty
                onChange={(n) => {
                  setSell(n)
                  persist({ sell: n })
                }}
              />
            )}
          </Field>

          <div className="field">
            <span className="label">ค่าใช้จ่ายที่ต้องใส่เพิ่ม</span>
            <ul className="lines">
              {lines.map((l, i) => (
                <li key={l.id}>
                  <select
                    aria-label="หมวด"
                    value={l.category}
                    onChange={(e) => setL(lines.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <MoneyInput ariaLabel="จำนวนเงิน" value={l.amount} allowEmpty onChange={(n) => setL(lines.map((x, j) => (j === i ? { ...x, amount: n } : x)))} />
                  <button type="button" className="icon-btn sm" aria-label="ลบ" onClick={() => setL(lines.filter((_, j) => j !== i))}>
                    <Icon name="x" size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="link" onClick={() => setL([...lines, { id: Date.now(), category: 'ซ่อมเครื่อง/เกียร์', amount: null }])}>
              + เพิ่มรายการ
            </button>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <span className="label">กำไรที่ต้องการ</span>
              <Segmented
                ariaLabel="วิธีคิดกำไร"
                value={mode}
                onChange={(m) => {
                  const v = m === 'profit' ? 40_000 : 15
                  setMode(m)
                  setValue(v)
                  persist({ mode: m, value: v })
                }}
                options={[
                  { value: 'profit', label: 'บาท' },
                  { value: 'markup', label: '% ทุน' },
                  { value: 'margin', label: '% ขาย' },
                ]}
              />
            </div>
            <Field label={mode === 'profit' ? 'กำไร (บาท)' : 'กำไร (%)'}>
              {(id) =>
                mode === 'profit' ? (
                  <MoneyInput
                    id={id}
                    value={value}
                    onChange={(n) => {
                      setValue(n ?? 0)
                      persist({ value: n ?? 0 })
                    }}
                  />
                ) : (
                  <NumInput
                    id={id}
                    value={value}
                    step={0.5}
                    suffix="%"
                    onChange={(n) => {
                      setValue(n)
                      persist({ value: n })
                    }}
                  />
                )
              }
            </Field>
          </div>
        </div>
      </section>

      <section className="appraise-result">
        <span>ซื้อเข้าได้ไม่เกิน</span>
        <b className={max != null && max <= 0 ? 'neg' : ''}>{max == null ? '—' : max <= 0 ? 'ไม่คุ้มซื้อ' : baht(max)}</b>
        <small>
          ขาย {sell ? baht(sell) : '–'} − ค่าใช้จ่าย {baht(exp)} − กำไรที่ต้องการ
        </small>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>ถ้าคนขายยอมที่ราคานี้</h2>
        </header>
        <div className="pad stack">
          <Field label="ราคาที่คนขายเสนอ">
            {(id) => (
              <MoneyInput
                id={id}
                value={offer}
                allowEmpty
                onChange={(n) => {
                  setOffer(n)
                  persist({ offer: n })
                }}
              />
            )}
          </Field>
          {offerView && offer ? (
            <div className={'verdict ' + (offerView.profit < 0 ? 'verdict-neg' : max != null && offer > max ? 'verdict-warn' : 'verdict-pos')}>
              <b>{offerView.profit < 0 ? 'ขาดทุน' : max != null && offer > max ? 'กำไรต่ำกว่าเป้า' : 'คุ้ม'}</b>
              <span>
                ทุนรวม {baht(offer + exp)} · กำไร {signed(offerView.profit)} ({pct(offerView.markupPct)} ของทุน)
                {max != null && offer > max && ` · ต้องต่อลงอีก ${baht(offer - max)}`}
              </span>
            </div>
          ) : (
            <p className="muted small">ใส่ราคาที่คนขายเสนอ เพื่อดูกำไรถ้าตกลงซื้อ</p>
          )}
        </div>
      </section>
    </div>
  )
}
