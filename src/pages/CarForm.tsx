import { useMemo, useState, type FormEvent } from 'react'
import { newCar, nextStockPreview, saveCar, useData } from '../lib/store'
import { BRANDS, FUELS, PROVINCES } from '../lib/constants'
import { carTitle } from '../lib/format'
import { go } from '../lib/router'
import type { Car } from '../lib/types'
import { Field, Icon, MoneyInput, Segmented, toast } from '../components/ui'

export default function CarForm({ id }: { id?: string }) {
  const { cars } = useData()
  const existing = id ? cars.find((c) => c.id === id) : undefined
  const [car, setCar] = useState<Car>(() => existing ?? newCar())
  const set = <K extends keyof Car>(k: K, v: Car[K]) => setCar((c) => ({ ...c, [k]: v }))

  const dup = useMemo(() => {
    const norm = (s: string) => s.replace(/[\s-]/g, '').toLowerCase()
    return cars.find(
      (c) =>
        c.id !== car.id &&
        ((car.plate && norm(c.plate) === norm(car.plate) && c.province === car.province) || (car.vin && norm(c.vin) === norm(car.vin))),
    )
  }, [cars, car.id, car.plate, car.province, car.vin])

  if (id && !existing) return <NotFound />

  function submit(e: FormEvent) {
    e.preventDefault()
    const no = car.stockNo || nextStockPreview()
    saveCar(car)
    toast(existing ? 'บันทึกการแก้ไขแล้ว' : `ลงรถ ${no} แล้ว`)
    go(`/car/${car.id}`)
  }

  const years = Array.from({ length: 40 }, (_, i) => new Date().getFullYear() + 1 - i)

  return (
    <form className="page page-narrow" onSubmit={submit}>
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={() => history.back()} aria-label="ย้อนกลับ">
          <Icon name="back" />
        </button>
        <h1>{existing ? `แก้ไข ${carTitle(existing)}` : 'ลงรถคันใหม่'}</h1>
      </header>

      <fieldset className="block">
        <legend>ตัวรถ</legend>
        <div className="grid">
          <Field label="ยี่ห้อ">
            {(fid) => (
              <>
                <input id={fid} list="brands" required value={car.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Toyota" />
                <datalist id="brands">
                  {BRANDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="รุ่น">{(fid) => <input id={fid} required value={car.model} onChange={(e) => set('model', e.target.value)} placeholder="Vios" />}</Field>
          <Field label="รุ่นย่อย">{(fid) => <input id={fid} value={car.subModel} onChange={(e) => set('subModel', e.target.value)} placeholder="1.5 G" />}</Field>
          <Field label="ปี (ค.ศ.)">
            {(fid) => (
              <select id={fid} value={car.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}>
                <option value="">–</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="สี">{(fid) => <input id={fid} value={car.color} onChange={(e) => set('color', e.target.value)} placeholder="ขาว" />}</Field>
          <Field label="เกียร์">
            {() => (
              <Segmented
                ariaLabel="เกียร์"
                value={car.gear || 'AT'}
                onChange={(v) => set('gear', v)}
                options={[
                  { value: 'AT', label: 'ออโต้' },
                  { value: 'MT', label: 'ธรรมดา' },
                ]}
              />
            )}
          </Field>
          <Field label="เชื้อเพลิง">
            {(fid) => (
              <select id={fid} value={car.fuel} onChange={(e) => set('fuel', e.target.value)}>
                {FUELS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="เลขไมล์">
            {(fid) => <MoneyInput id={fid} value={car.mileage} allowEmpty suffix="กม." onChange={(n) => set('mileage', n)} />}
          </Field>
        </div>
      </fieldset>

      <fieldset className="block">
        <legend>ทะเบียน</legend>
        <div className="grid">
          <Field label="เลขทะเบียน">{(fid) => <input id={fid} value={car.plate} onChange={(e) => set('plate', e.target.value)} placeholder="1กข 1234" />}</Field>
          <Field label="จังหวัด">
            {(fid) => (
              <>
                <input id={fid} list="provinces" value={car.province} onChange={(e) => set('province', e.target.value)} />
                <datalist id="provinces">
                  {PROVINCES.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="เลขตัวถัง (VIN)" wide>
            {(fid) => <input id={fid} className="mono" value={car.vin} onChange={(e) => set('vin', e.target.value.toUpperCase())} />}
          </Field>
        </div>
        {dup && (
          <p className="form-warn">
            ทะเบียน/เลขตัวถังซ้ำกับ <a href={`#/car/${dup.id}`}>{dup.stockNo} {carTitle(dup)}</a> ที่ลงไว้แล้ว
          </p>
        )}
      </fieldset>

      <fieldset className="block">
        <legend>การซื้อเข้า</legend>
        <div className="grid">
          <Field label="ราคาที่ซื้อมา" hint="พิมพ์ 285k หรือ 285,000 ก็ได้">
            {(fid) => <MoneyInput id={fid} value={car.purchasePrice} onChange={(n) => set('purchasePrice', n ?? 0)} />}
          </Field>
          <Field label="วันที่ซื้อ">{(fid) => <input id={fid} type="date" value={car.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} />}</Field>
          <Field label="ซื้อจาก" hint="ชื่อ / ลานประมูล / เต็นท์">
            {(fid) => <input id={fid} value={car.purchasedFrom} onChange={(e) => set('purchasedFrom', e.target.value)} />}
          </Field>
          <Field label="เลขสต็อก" hint={existing ? undefined : 'เว้นว่างไว้ ระบบออกเลขให้'}>
            {(fid) => (
              <input id={fid} className="mono" value={car.stockNo} placeholder={existing ? '' : nextStockPreview()} onChange={(e) => set('stockNo', e.target.value)} />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="block">
        <legend>บันทึก</legend>
        <textarea rows={3} aria-label="บันทึก" value={car.notes} onChange={(e) => set('notes', e.target.value)} placeholder="สภาพรถ จุดที่ต้องซ่อม เล่มอยู่ไหน ฯลฯ" />
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn" onClick={() => history.back()}>
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-primary">
          {existing ? 'บันทึก' : 'ลงรถ แล้วไปใส่ค่าใช้จ่าย'}
        </button>
      </div>
    </form>
  )
}

export function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <p>ไม่พบรถคันนี้ อาจถูกลบไปแล้ว</p>
        <a className="btn" href="#/cars">
          กลับไปรายการรถ
        </a>
      </div>
    </div>
  )
}
