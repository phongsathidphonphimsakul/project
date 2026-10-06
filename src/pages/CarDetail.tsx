import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  addExpense,
  canDeleteExpense,
  deleteCar,
  memberName,
  removeExpense,
  removePhoto,
  saveCar,
  uid,
  updateCar,
  updateExpense,
  uploadPhoto,
  useData,
  useIsOwner,
  useStore,
} from '../lib/store'
import { daysInStock, expenseTotal, installment, profitAt, quote, todayISO, totalCost } from '../lib/calc'
import { baht, carTitle, pct, signed, thaiDate } from '../lib/format'
import { EXPENSE_CATEGORIES } from '../lib/constants'
import { STATUS_LABEL, STATUS_ORDER, type Car, type CarStatus, type Expense, type PricingPlan, type Rounding } from '../lib/types'
import { go } from '../lib/router'
import { shrinkImage } from '../lib/image'
import { Field, Icon, Modal, MoneyInput, NumInput, Segmented, toast } from '../components/ui'
import { NotFound } from './CarForm'

export default function CarDetail({ id }: { id: string }) {
  const { cars } = useData()
  const car = cars.find((c) => c.id === id)
  if (!car) return <NotFound />
  return <Detail key={car.id} car={car} />
}

function Detail({ car }: { car: Car }) {
  const cost = totalCost(car)
  const days = daysInStock(car)
  const shownPrice = car.sale?.price ?? car.askingPrice
  const profit = shownPrice != null ? profitAt(shownPrice, cost) : null
  const [modal, setModal] = useState<null | 'reserve' | 'sell' | 'delete'>(null)
  const owner = useIsOwner()
  const teamSize = useStore((s) => s.members.length)

  function setStatus(s: CarStatus) {
    if (s === 'sold') return setModal('sell')
    if (s === 'reserved') return setModal('reserve')
    updateCar(car.id, (c) => ({ ...c, status: s, sale: null, reservation: s === 'ready' || s === 'prep' || s === 'stock' ? null : c.reservation }))
  }

  return (
    <div className="page">
      <header className="page-head detail-head">
        <button type="button" className="icon-btn" onClick={() => go('/cars')} aria-label="กลับไปรายการรถ">
          <Icon name="back" />
        </button>
        <div className="detail-title">
          <span className="mono muted">{car.stockNo}</span>
          <h1>{carTitle(car)}</h1>
          <span className="muted">
            {[car.plate && `${car.plate} ${car.province}`, car.color, car.gear === 'AT' ? 'ออโต้' : car.gear === 'MT' ? 'ธรรมดา' : '', car.fuel, car.mileage != null ? `${baht(car.mileage)} กม.` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="detail-actions">
          <a className="btn" href={`#/car/${car.id}/print`}>
            <Icon name="print" /> <span className="hide-sm">ป้ายติดรถ</span>
          </a>
          <a className="btn" href={`#/car/${car.id}/edit`}>
            <Icon name="edit" /> <span className="hide-sm">แก้ไข</span>
          </a>
          {owner && (
            <button type="button" className="btn btn-ghost-danger" onClick={() => setModal('delete')} aria-label="ลบรถ">
              <Icon name="trash" />
            </button>
          )}
        </div>
      </header>

      <div className="status-row">
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" className={'status-step' + (car.status === s ? ' on' : '')} onClick={() => setStatus(s)} aria-pressed={car.status === s}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {car.reservation && car.status === 'reserved' && (
        <div className="note-strip">
          จองโดย <b>{car.reservation.name || '–'}</b> {car.reservation.phone && <a href={`tel:${car.reservation.phone}`}>{car.reservation.phone}</a>} · มัดจำ{' '}
          <b>{baht(car.reservation.deposit)}</b> · {thaiDate(car.reservation.date)}
          <button type="button" className="link" onClick={() => setModal('sell')}>
            ปิดการขาย
          </button>
        </div>
      )}
      {car.sale && (
        <div className="note-strip note-sold">
          ขายให้ <b>{car.sale.buyer || '–'}</b> {car.sale.phone && <a href={`tel:${car.sale.phone}`}>{car.sale.phone}</a>} · {thaiDate(car.sale.date)} · จอด {days} วัน
          {car.sale.note && <> · {car.sale.note}</>}
          <button type="button" className="link" onClick={() => setModal('sell')}>
            แก้ไข
          </button>
        </div>
      )}

      <section className="summary">
        <div>
          <span>ทุนรวม</span>
          <b>{baht(cost)}</b>
          <small>ซื้อ {baht(car.purchasePrice)} + ค่าใช้จ่าย {baht(expenseTotal(car))}</small>
        </div>
        <div className="summary-price">
          <span>{car.sale ? 'ขายได้' : 'ราคาตั้งขาย'}</span>
          {shownPrice != null ? <b className="sticker">{baht(shownPrice)}</b> : <b className="muted">ยังไม่ตั้ง</b>}
        </div>
        <div>
          <span>กำไร{car.sale ? 'จริง' : 'ถ้าขายตามราคาตั้ง'}</span>
          <b className={profit ? (profit.profit >= 0 ? 'pos' : 'neg') : ''}>{profit ? signed(profit.profit) : '–'}</b>
          {profit && (
            <small>
              {pct(profit.markupPct)} ของทุน · {pct(profit.marginPct)} ของราคาขาย
            </small>
          )}
        </div>
        <div>
          <span>{car.sale ? 'ใช้เวลาขาย' : 'จอดมาแล้ว'}</span>
          <b>{days} วัน</b>
          <small>ซื้อเข้า {thaiDate(car.purchaseDate)}</small>
        </div>
      </section>

      <div className="detail-grid">
        <div className="col">
          <CostLedger car={car} />
          <Breakdown car={car} />
          <PhotoBlock car={car} />
          {teamSize > 1 && (
            <p className="muted small audit">
              ลงรถโดย {memberName(car.createdBy) || '–'}
              {car.updatedBy && ` · แก้ไขล่าสุดโดย ${memberName(car.updatedBy)} ${new Date(car.updatedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`}
            </p>
          )}
          {car.notes && (
            <section className="panel">
              <header className="panel-head">
                <h2>บันทึก</h2>
              </header>
              <p className="pad prewrap">{car.notes}</p>
            </section>
          )}
        </div>
        <div className="col">
          <PricingPanel car={car} cost={cost} />
          <NegotiatePanel car={car} cost={cost} />
          <FinancePanel price={car.askingPrice} />
        </div>
      </div>

      {modal === 'reserve' && <ReserveModal car={car} onClose={() => setModal(null)} />}
      {modal === 'sell' && <SellModal car={car} onClose={() => setModal(null)} />}
      {modal === 'delete' && (
        <Modal title="ลบรถคันนี้?" onClose={() => setModal(null)}>
          <p>
            {car.stockNo} {carTitle(car)} พร้อมค่าใช้จ่าย {car.expenses.length} รายการจะถูกลบถาวร
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setModal(null)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                deleteCar(car.id)
                toast('ลบแล้ว')
                go('/cars')
              }}
            >
              ลบถาวร
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---------------- ต้นทุน ---------------- */

function CostLedger({ car }: { car: Car }) {
  const [cat, setCat] = useState<string>(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [vendor, setVendor] = useState('')
  const [date, setDate] = useState(todayISO())
  const [editing, setEditing] = useState<Expense | null>(null)
  const amountRef = useRef<HTMLDivElement>(null)
  const showWho = useStore((s) => s.members.length > 1)

  function add(e: FormEvent) {
    e.preventDefault()
    if (!amount) return
    addExpense(car.id, { id: uid(), category: cat, label: label.trim(), amount, date, vendor: vendor.trim() })
    setAmount(null)
    setLabel('')
    toast(`เพิ่ม ${cat} ${baht(amount)} บาท`)
    amountRef.current?.querySelector('input')?.focus()
  }

  const vendors = useMemo(() => [...new Set(car.expenses.map((e) => e.vendor).filter(Boolean))], [car.expenses])

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>ต้นทุน</h2>
        <span className="muted">{car.expenses.length + 1} รายการ</span>
      </header>

      <table className="ledger cost-table">
        <tbody>
          <tr className="row-strong">
            <td className="date">{thaiDate(car.purchaseDate)}</td>
            <td>
              ราคาซื้อรถ
              {car.purchasedFrom && <small className="muted"> · {car.purchasedFrom}</small>}
            </td>
            <td className="num">{baht(car.purchasePrice)}</td>
            <td />
          </tr>
          {car.expenses.map((e) => (
            <tr key={e.id}>
              <td className="date">{thaiDate(e.date)}</td>
              <td>
                <span className="cat">{e.category}</span>
                {e.label && <> {e.label}</>}
                {e.vendor && <small className="muted"> · {e.vendor}</small>}
                {showWho && e.createdBy && <small className="who">{memberName(e.createdBy)}</small>}
              </td>
              <td className="num">{baht(e.amount)}</td>
              <td className="row-act">
                <button type="button" className="icon-btn sm" onClick={() => setEditing(e)} aria-label={`แก้ไข ${e.category}`}>
                  <Icon name="edit" size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td>ทุนรวม</td>
            <td className="num">{baht(totalCost(car))}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <form className="add-expense" onSubmit={add}>
        <div className="chips" role="radiogroup" aria-label="หมวดค่าใช้จ่าย">
          {EXPENSE_CATEGORIES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cat === c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="add-row">
          <div ref={amountRef} className="add-amount">
            <MoneyInput value={amount} allowEmpty onChange={setAmount} placeholder="จำนวนเงิน" ariaLabel="จำนวนเงิน" />
          </div>
          <input aria-label="รายละเอียด" placeholder="รายละเอียด เช่น เปลี่ยนโช้คหน้า" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input aria-label="ร้าน/ช่าง" placeholder="ร้าน/ช่าง" list={`vendors-${car.id}`} value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <datalist id={`vendors-${car.id}`}>
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <input aria-label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!amount}>
            <Icon name="plus" /> เพิ่ม
          </button>
        </div>
      </form>

      {editing && <ExpenseModal carId={car.id} expense={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function ExpenseModal({ carId, expense, onClose }: { carId: string; expense: Expense; onClose: () => void }) {
  const [e, setE] = useState(expense)
  return (
    <Modal title="แก้ไขค่าใช้จ่าย" onClose={onClose}>
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          updateExpense(carId, e)
          onClose()
        }}
      >
        <div className="grid grid-2">
          <Field label="หมวด">
            {(id) => (
              <select id={id} value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>
                {[...new Set([e.category, ...EXPENSE_CATEGORIES])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="จำนวนเงิน">{(id) => <MoneyInput id={id} value={e.amount} onChange={(n) => setE({ ...e, amount: n ?? 0 })} />}</Field>
          <Field label="รายละเอียด">{(id) => <input id={id} value={e.label} onChange={(x) => setE({ ...e, label: x.target.value })} />}</Field>
          <Field label="ร้าน/ช่าง">{(id) => <input id={id} value={e.vendor} onChange={(x) => setE({ ...e, vendor: x.target.value })} />}</Field>
          <Field label="วันที่">{(id) => <input id={id} type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />}</Field>
        </div>
        <div className="form-actions">
          {canDeleteExpense(expense) ? (
            <button
              type="button"
              className="btn btn-ghost-danger"
              onClick={() => {
                removeExpense(carId, e.id)
                toast('ลบรายการแล้ว')
                onClose()
              }}
            >
              <Icon name="trash" /> ลบรายการ
            </button>
          ) : (
            <small className="muted">ลบได้เฉพาะคนที่ลงรายการ หรือเจ้าของเต็นท์</small>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Breakdown({ car }: { car: Car }) {
  const rows = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of car.expenses) m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [car.expenses])
  if (rows.length < 2) return null
  const total = rows.reduce((s, [, v]) => s + v, 0)
  const max = rows[0][1]
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>ค่าใช้จ่ายแยกหมวด</h2>
        <span className="muted">ไม่รวมราคาซื้อ</span>
      </header>
      <ul className="bars">
        {rows.map(([k, v]) => (
          <li key={k} title={`${k} ${baht(v)} บาท`}>
            <span className="bars-label">{k}</span>
            <span className="bars-track">
              <span style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="num">{baht(v)}</span>
            <span className="num muted">{Math.round((v / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PhotoBlock({ car }: { car: Car }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function pick(f: File | undefined) {
    if (!f) return
    setBusy(true)
    try {
      await uploadPhoto(car.id, await shrinkImage(f))
    } catch {
      toast('อ่านไฟล์รูปไม่ได้')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>รูปรถ</h2>
        {car.photoPath && (
          <button type="button" className="link" onClick={() => removePhoto(car.id)}>
            ลบรูป
          </button>
        )}
      </header>
      <button type="button" className={'photo' + (car.photoUrl ? '' : ' photo-empty')} onClick={() => input.current?.click()} disabled={busy}>
        {car.photoUrl ? (
          <img src={car.photoUrl} alt={carTitle(car)} />
        ) : (
          <span>
            <Icon name="camera" size={22} />
            {busy ? 'กำลังอัปโหลด…' : 'ถ่าย/เลือกรูปหน้ารถ'}
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </section>
  )
}

/* ---------------- ตั้งราคา ---------------- */

const ROUNDING: { value: Rounding; label: string }[] = [
  { value: 'end9', label: 'ลงท้าย 9,000' },
  { value: '10000', label: 'หมื่น' },
  { value: '5000', label: '5 พัน' },
  { value: '1000', label: 'พัน' },
  { value: 'none', label: 'ไม่ปัด' },
]

function PricingPanel({ car, cost }: { car: Car; cost: number }) {
  const [plan, setPlan] = useState<PricingPlan>(car.pricing)
  const q = quote(cost, plan)
  const first = useRef(true)

  // บันทึกแผนตั้งราคาหลังหยุดพิมพ์ ไม่ยิงฐานข้อมูลทุกตัวอักษร
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = window.setTimeout(() => updateCar(car.id, (c) => ({ ...c, pricing: plan })), 700)
    return () => window.clearTimeout(t)
  }, [plan, car.id])

  const p = (patch: Partial<PricingPlan>) => setPlan((x) => ({ ...x, ...patch }))
  const valueSuffix = plan.mode === 'profit' ? '฿' : '%'
  const applied = car.askingPrice === q.list

  return (
    <section className="panel panel-accent">
      <header className="panel-head">
        <h2>ตั้งราคาขาย</h2>
      </header>
      <div className="pad stack">
        <Segmented
          ariaLabel="วิธีคิดกำไร"
          value={plan.mode}
          onChange={(mode) => p({ mode, value: mode === 'profit' ? (plan.mode === 'profit' ? plan.value : 40_000) : plan.mode === 'profit' ? 15 : plan.value })}
          options={[
            { value: 'profit', label: 'กำไรเป็นบาท' },
            { value: 'markup', label: '% จากทุน' },
            { value: 'margin', label: '% จากราคาขาย' },
          ]}
        />
        <div className="grid grid-2">
          <Field
            label={plan.mode === 'profit' ? 'อยากได้กำไร' : plan.mode === 'markup' ? 'บวกจากทุน' : 'กำไรเป็น % ของราคาขาย'}
            hint={plan.mode === 'markup' ? 'ทุน 300,000 บวก 15% = 345,000' : plan.mode === 'margin' ? 'ขาย 345,000 ได้กำไร 15% = 51,750' : undefined}
          >
            {(id) =>
              plan.mode === 'profit' ? (
                <MoneyInput id={id} value={plan.value} onChange={(n) => p({ value: n ?? 0 })} suffix={valueSuffix} />
              ) : (
                <NumInput id={id} value={plan.value} step={0.5} min={0} max={plan.mode === 'margin' ? 99 : undefined} onChange={(n) => p({ value: n })} suffix="%" />
              )
            }
          </Field>
          <Field label="เผื่อลูกค้าต่อราคา" hint="บวกเพิ่มบนราคาต่ำสุด">
            {(id) => <MoneyInput id={id} value={plan.buffer} onChange={(n) => p({ buffer: n ?? 0 })} />}
          </Field>
        </div>
        <div className="field">
          <span className="label">ปัดราคาขึ้น</span>
          <Segmented ariaLabel="ปัดราคา" value={plan.rounding} onChange={(rounding) => p({ rounding })} options={ROUNDING} />
        </div>

        {cost <= 0 ? (
          <p className="muted">ใส่ราคาซื้อรถก่อน ระบบถึงจะคำนวณราคาขายได้</p>
        ) : !q.valid ? (
          <p className="neg">% จากราคาขายต้องน้อยกว่า 100</p>
        ) : (
          <div className="quote">
            <div className="quote-row">
              <span>ทุนรวม</span>
              <span className="num">{baht(cost)}</span>
            </div>
            <div className="quote-row">
              <span>ราคาต่ำสุดที่ยอมได้</span>
              <span className="num">
                {baht(q.floor)} <small className="pos">{signed(q.profitAtFloor)}</small>
              </span>
            </div>
            <div className="quote-row quote-main">
              <span>ราคาตั้งขาย</span>
              <span className="sticker">{baht(q.list)}</span>
            </div>
            <div className="quote-row">
              <span>กำไรถ้าขายได้ราคานี้</span>
              <span className="num pos">
                {signed(q.profitAtList)} <small>({pct(profitAt(q.list, cost).markupPct)} ของทุน)</small>
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={applied || car.status === 'sold'}
              onClick={() => {
                saveCar({ ...car, pricing: plan, askingPrice: q.list })
                toast(`ตั้งราคา ${baht(q.list)} แล้ว`)
              }}
            >
              {applied ? (
                <>
                  <Icon name="check" /> ใช้ราคานี้อยู่
                </>
              ) : (
                `ใช้ ${baht(q.list)} เป็นราคาตั้งขาย`
              )}
            </button>
          </div>
        )}

        <ManualPrice car={car} />
      </div>
    </section>
  )
}

function ManualPrice({ car }: { car: Car }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<number | null>(car.askingPrice)
  if (!open)
    return (
      <button type="button" className="link" onClick={() => setOpen(true)}>
        กำหนดราคาตั้งขายเอง
      </button>
    )
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        saveCar({ ...car, askingPrice: v })
        setOpen(false)
        toast(v ? `ตั้งราคา ${baht(v)} แล้ว` : 'ล้างราคาตั้งแล้ว')
      }}
    >
      <MoneyInput value={v} allowEmpty onChange={setV} autoFocus ariaLabel="ราคาตั้งขาย" />
      <button type="submit" className="btn">
        บันทึก
      </button>
    </form>
  )
}

function NegotiatePanel({ car, cost }: { car: Car; cost: number }) {
  const [offer, setOffer] = useState<number | null>(null)
  const v = offer ? profitAt(offer, cost) : null
  const floor = quote(cost, car.pricing).floor
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>ลูกค้าต่อราคา</h2>
      </header>
      <div className="pad stack">
        <Field label="ลูกค้าขอเหลือ">{(id) => <MoneyInput id={id} value={offer} allowEmpty onChange={setOffer} placeholder={car.askingPrice ? baht(car.askingPrice) : '0'} />}</Field>
        {v && offer ? (
          <div className={'verdict ' + (v.profit < 0 ? 'verdict-neg' : offer < floor ? 'verdict-warn' : 'verdict-pos')}>
            <b>{v.profit < 0 ? 'ขาดทุน' : offer < floor ? 'ได้กำไรน้อยกว่าเป้า' : 'ขายได้'}</b>
            <span>
              กำไร {signed(v.profit)} บาท ({pct(v.markupPct)} ของทุน)
              {car.askingPrice ? ` · ลดจากราคาตั้ง ${baht(car.askingPrice - offer)}` : ''}
            </span>
          </div>
        ) : (
          <p className="muted small">ใส่ราคาที่ลูกค้าขอ เพื่อดูว่ายังได้กำไรเท่าไหร่ เทียบกับราคาต่ำสุด {floor ? baht(floor) : '–'}</p>
        )}
      </div>
    </section>
  )
}

function FinancePanel({ price }: { price: number | null }) {
  const { settings } = useData()
  const [down, setDown] = useState(settings.finance.downPct)
  const [rate, setRate] = useState(settings.finance.ratePct)
  const [vat, setVat] = useState(settings.finance.vat)
  if (!price)
    return (
      <section className="panel">
        <header className="panel-head">
          <h2>ค่างวดโดยประมาณ</h2>
        </header>
        <p className="pad muted small">ตั้งราคาขายก่อน แล้วจะคำนวณค่างวดให้</p>
      </section>
    )
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>ค่างวดโดยประมาณ</h2>
        <span className="muted small">ดอกเบี้ยคงที่</span>
      </header>
      <div className="pad stack">
        <div className="grid grid-3">
          <Field label="ดาวน์">{(id) => <NumInput id={id} value={down} step={5} min={0} max={100} onChange={setDown} suffix="%" />}</Field>
          <Field label="ดอกเบี้ย/ปี">{(id) => <NumInput id={id} value={rate} step={0.1} min={0} onChange={setRate} suffix="%" />}</Field>
          <div className="field">
            <span className="label">VAT 7%</span>
            <Segmented
              ariaLabel="VAT"
              value={vat ? 'y' : 'n'}
              onChange={(x) => setVat(x === 'y')}
              options={[
                { value: 'y', label: 'รวม' },
                { value: 'n', label: 'ไม่รวม' },
              ]}
            />
          </div>
        </div>
        <table className="ledger fin-table">
          <thead>
            <tr>
              <th>งวด</th>
              <th className="num">ต่อเดือน</th>
            </tr>
          </thead>
          <tbody>
            {settings.finance.terms.map((t) => {
              const r = installment(price, down, rate, t, vat)
              return (
                <tr key={t}>
                  <td>
                    {t} เดือน <small className="muted">({t / 12} ปี)</small>
                  </td>
                  <td className="num">{baht(r.monthly)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="muted small">
                ดาวน์ {baht(installment(price, down, rate, 12, vat).down)} · ยอดจัด {baht(installment(price, down, rate, 12, vat).financed)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

/* ---------------- จอง / ขาย ---------------- */

function ReserveModal({ car, onClose }: { car: Car; onClose: () => void }) {
  const [r, setR] = useState(car.reservation ?? { name: '', phone: '', deposit: 5_000, date: todayISO() })
  return (
    <Modal title="ลูกค้าจองรถ" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveCar({ ...car, status: 'reserved', reservation: r, sale: null })
          toast('บันทึกการจองแล้ว')
          onClose()
        }}
      >
        <div className="grid grid-2">
          <Field label="ชื่อลูกค้า">{(id) => <input id={id} autoFocus value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />}</Field>
          <Field label="เบอร์โทร">{(id) => <input id={id} type="tel" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} />}</Field>
          <Field label="เงินมัดจำ">{(id) => <MoneyInput id={id} value={r.deposit} onChange={(n) => setR({ ...r, deposit: n ?? 0 })} />}</Field>
          <Field label="วันที่จอง">{(id) => <input id={id} type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} />}</Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary">
            บันทึกการจอง
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SellModal({ car, onClose }: { car: Car; onClose: () => void }) {
  const cost = totalCost(car)
  const [s, setS] = useState(
    car.sale ?? {
      price: car.askingPrice ?? 0,
      date: todayISO(),
      buyer: car.reservation?.name ?? '',
      phone: car.reservation?.phone ?? '',
      note: '',
    },
  )
  const v = profitAt(s.price, cost)
  return (
    <Modal title="ปิดการขาย" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveCar({ ...car, status: 'sold', sale: s })
          toast(`ขาย ${car.stockNo} แล้ว กำไร ${signed(v.profit)}`)
          onClose()
        }}
      >
        <div className="grid grid-2">
          <Field label="ราคาขายจริง">{(id) => <MoneyInput id={id} autoFocus value={s.price} onChange={(n) => setS({ ...s, price: n ?? 0 })} />}</Field>
          <Field label="วันที่ขาย">{(id) => <input id={id} type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />}</Field>
          <Field label="ชื่อผู้ซื้อ">{(id) => <input id={id} value={s.buyer} onChange={(e) => setS({ ...s, buyer: e.target.value })} />}</Field>
          <Field label="เบอร์โทร">{(id) => <input id={id} type="tel" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />}</Field>
          <Field label="หมายเหตุ" wide>
            {(id) => <input id={id} placeholder="เช่น ไฟแนนซ์ไหน แถมอะไร" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />}
          </Field>
        </div>
        <div className={'verdict ' + (v.profit >= 0 ? 'verdict-pos' : 'verdict-neg')}>
          <b>{v.profit >= 0 ? 'กำไร' : 'ขาดทุน'} {baht(Math.abs(v.profit))} บาท</b>
          <span>
            ทุน {baht(cost)} · {pct(v.markupPct)} ของทุน · {pct(v.marginPct)} ของราคาขาย
          </span>
        </div>
        <div className="form-actions">
          {car.sale && (
            <button
              type="button"
              className="btn btn-ghost-danger"
              onClick={() => {
                saveCar({ ...car, status: 'ready', sale: null })
                toast('ยกเลิกการขายแล้ว')
                onClose()
              }}
            >
              ยกเลิกการขาย
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            ปิด
          </button>
          <button type="submit" className="btn btn-primary" disabled={!s.price}>
            บันทึกการขาย
          </button>
        </div>
      </form>
    </Modal>
  )
}
