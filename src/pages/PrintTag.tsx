import { useEffect } from 'react'
import { useData } from '../lib/store'
import { installment } from '../lib/calc'
import { baht } from '../lib/format'
import { Icon } from '../components/ui'
import { NotFound } from './CarForm'

/** ป้ายราคาติดกระจกรถ ขนาด A4 แนวตั้ง */
export default function PrintTag({ id }: { id: string }) {
  const { cars, settings } = useData()
  const car = cars.find((c) => c.id === id)

  useEffect(() => {
    document.body.classList.add('print-mode')
    return () => document.body.classList.remove('print-mode')
  }, [])

  if (!car) return <NotFound />
  const price = car.askingPrice
  const f = settings.finance
  const plans = price ? f.terms.slice(-2).map((t) => ({ t, ...installment(price, f.downPct, f.ratePct, t, f.vat) })) : []

  return (
    <div className="print-wrap">
      <div className="print-bar no-print">
        <a className="btn" href={`#/car/${car.id}`}>
          <Icon name="back" /> กลับ
        </a>
        <span className="muted">ดาวน์ {f.downPct}% · ดอกเบี้ย {f.ratePct}% ต่อปี (แก้ได้ที่หน้าตั้งค่า)</span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="print" /> พิมพ์
        </button>
      </div>

      <article className="tag">
        <header className="tag-head">
          <span className="tag-brand">{car.brand}</span>
          <span className="tag-stock">{car.stockNo}</span>
        </header>
        <h1 className="tag-model">
          {car.model} <span>{car.subModel}</span>
        </h1>
        <p className="tag-year">{car.year ? `ปี ${car.year}` : ''}</p>

        <dl className="tag-specs">
          {car.gear && (
            <div>
              <dt>เกียร์</dt>
              <dd>{car.gear === 'AT' ? 'ออโต้' : 'ธรรมดา'}</dd>
            </div>
          )}
          {car.mileage != null && (
            <div>
              <dt>เลขไมล์</dt>
              <dd>{baht(car.mileage)} กม.</dd>
            </div>
          )}
          {car.color && (
            <div>
              <dt>สี</dt>
              <dd>{car.color}</dd>
            </div>
          )}
          {car.fuel && (
            <div>
              <dt>เชื้อเพลิง</dt>
              <dd>{car.fuel}</dd>
            </div>
          )}
        </dl>

        <div className="tag-price">
          <span>ราคา</span>
          <b>{price ? baht(price) : '—'}</b>
          <span>บาท</span>
        </div>

        {plans.length > 0 && (
          <div className="tag-fin">
            <p>
              ดาวน์ {baht(plans[0].down)} บาท
            </p>
            {plans.map((p) => (
              <p key={p.t}>
                ผ่อน <b>{baht(p.monthly)}</b> × {p.t} งวด
              </p>
            ))}
          </div>
        )}

        <footer className="tag-foot">
          <span>{settings.shopName}</span>
          <b>{settings.shopPhone}</b>
        </footer>
      </article>
    </div>
  )
}
