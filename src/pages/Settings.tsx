import { useRef, useState } from 'react'
import { importBackup, saveSettings, signOut, snapshot, useData, useIsOwner, useStore } from '../lib/store'
import { isIOS, isStandalone, promptInstall, useCanInstall } from '../lib/pwa'
import { ShopsSection, TeamSection } from '../components/Team'
import { supabase } from '../lib/supabase'
import { daysInStock, expenseTotal, totalCost } from '../lib/calc'
import { STATUS_LABEL, type Rounding, type Settings } from '../lib/types'
import { todayISO } from '../lib/calc'
import { Field, Icon, MoneyInput, NumInput, Segmented, toast } from '../components/ui'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(v: unknown) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv() {
  const { cars } = snapshot()
  const head = ['เลขสต็อก', 'ยี่ห้อ', 'รุ่น', 'รุ่นย่อย', 'ปี', 'สี', 'ทะเบียน', 'จังหวัด', 'เลขตัวถัง', 'วันที่ซื้อ', 'ราคาซื้อ', 'ค่าใช้จ่าย', 'ทุนรวม', 'ราคาตั้ง', 'สถานะ', 'วันที่ขาย', 'ราคาขาย', 'กำไร', 'จำนวนวัน', 'ผู้ซื้อ']
  const rows = cars.map((c) => {
    const cost = totalCost(c)
    return [
      c.stockNo, c.brand, c.model, c.subModel, c.year, c.color, c.plate, c.province, c.vin, c.purchaseDate, c.purchasePrice,
      expenseTotal(c), cost, c.askingPrice, STATUS_LABEL[c.status], c.sale?.date, c.sale?.price, c.sale ? c.sale.price - cost : '', daysInStock(c), c.sale?.buyer,
    ]
  })
  const exp = [['เลขสต็อก', 'วันที่', 'หมวด', 'รายละเอียด', 'ร้าน/ช่าง', 'จำนวนเงิน']]
  for (const c of cars) for (const e of c.expenses) exp.push([c.stockNo, e.date, e.category, e.label, e.vendor, String(e.amount)])
  const bom = '﻿' // ให้ Excel อ่านภาษาไทยถูก
  download(`lanrot-cars-${todayISO()}.csv`, bom + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  download(`lanrot-expenses-${todayISO()}.csv`, bom + exp.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
}

export default function SettingsPage() {
  const { settings, cars } = useData()
  const user = useStore((s) => s.user)
  const [s, setS] = useState<Settings>(settings)
  const [base, setBase] = useState<Settings>(settings)
  const [pw, setPw] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const owner = useIsOwner()
  const canInstall = useCanInstall()
  const dirty = JSON.stringify(s) !== JSON.stringify(settings)
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch })

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>ตั้งค่าและทีม</h1>
      </header>

      <TeamSection />

      {owner ? (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // เลขสต็อกอาจเดินไปแล้วระหว่างที่เปิดหน้านี้ (คนอื่นลงรถ) — ส่งเฉพาะถ้าแก้เอง
          const next = { ...s, nextStockNo: s.nextStockNo === base.nextStockNo ? settings.nextStockNo : s.nextStockNo }
          saveSettings(next)
          setS(next)
          setBase(next)
          toast('บันทึกการตั้งค่าแล้ว')
        }}
      >
        <fieldset className="plain">
        <fieldset className="block">
          <legend>ร้าน</legend>
          <div className="grid grid-2">
            <Field label="ชื่อเต็นท์" hint="แสดงบนป้ายติดรถ">
              {(id) => <input id={id} value={s.shopName} onChange={(e) => set({ shopName: e.target.value })} />}
            </Field>
            <Field label="เบอร์โทร">{(id) => <input id={id} type="tel" value={s.shopPhone} onChange={(e) => set({ shopPhone: e.target.value })} />}</Field>
            <Field label="ตัวนำเลขสต็อก">{(id) => <input id={id} className="mono" value={s.stockPrefix} onChange={(e) => set({ stockPrefix: e.target.value })} />}</Field>
            <Field label="เลขสต็อกถัดไป">{(id) => <NumInput id={id} value={s.nextStockNo} min={1} onChange={(n) => set({ nextStockNo: Math.max(1, Math.floor(n)) })} />}</Field>
          </div>
        </fieldset>

        <fieldset className="block">
          <legend>ค่าเริ่มต้นตอนตั้งราคา (รถที่ลงใหม่)</legend>
          <div className="stack">
            <Segmented
              ariaLabel="วิธีคิดกำไร"
              value={s.defaultPricing.mode}
              onChange={(mode) => set({ defaultPricing: { ...s.defaultPricing, mode, value: mode === 'profit' ? 40_000 : 15 } })}
              options={[
                { value: 'profit', label: 'กำไรเป็นบาท' },
                { value: 'markup', label: '% จากทุน' },
                { value: 'margin', label: '% จากราคาขาย' },
              ]}
            />
            <div className="grid grid-2">
              <Field label="กำไร">
                {(id) =>
                  s.defaultPricing.mode === 'profit' ? (
                    <MoneyInput id={id} value={s.defaultPricing.value} onChange={(n) => set({ defaultPricing: { ...s.defaultPricing, value: n ?? 0 } })} />
                  ) : (
                    <NumInput id={id} value={s.defaultPricing.value} suffix="%" step={0.5} onChange={(n) => set({ defaultPricing: { ...s.defaultPricing, value: n } })} />
                  )
                }
              </Field>
              <Field label="เผื่อต่อราคา">
                {(id) => <MoneyInput id={id} value={s.defaultPricing.buffer} onChange={(n) => set({ defaultPricing: { ...s.defaultPricing, buffer: n ?? 0 } })} />}
              </Field>
              <Field label="ปัดราคา">
                {(id) => (
                  <select id={id} value={s.defaultPricing.rounding} onChange={(e) => set({ defaultPricing: { ...s.defaultPricing, rounding: e.target.value as Rounding } })}>
                    <option value="end9">ลงท้าย 9,000</option>
                    <option value="10000">หลักหมื่น</option>
                    <option value="5000">หลัก 5 พัน</option>
                    <option value="1000">หลักพัน</option>
                    <option value="none">ไม่ปัด</option>
                  </select>
                )}
              </Field>
              <Field label="เตือนเมื่อจอดนานเกิน">{(id) => <NumInput id={id} value={s.agingWarnDays} min={1} suffix="วัน" onChange={(n) => set({ agingWarnDays: n })} />}</Field>
            </div>
          </div>
        </fieldset>

        <fieldset className="block">
          <legend>ไฟแนนซ์ (ค่างวดบนป้ายติดรถ)</legend>
          <div className="grid grid-2">
            <Field label="ดาวน์">{(id) => <NumInput id={id} value={s.finance.downPct} suffix="%" onChange={(n) => set({ finance: { ...s.finance, downPct: n } })} />}</Field>
            <Field label="ดอกเบี้ยต่อปี">{(id) => <NumInput id={id} value={s.finance.ratePct} step={0.1} suffix="%" onChange={(n) => set({ finance: { ...s.finance, ratePct: n } })} />}</Field>
            <Field label="จำนวนงวด" hint="คั่นด้วยคอมมา">
              {(id) => (
                <input
                  id={id}
                  defaultValue={s.finance.terms.join(', ')}
                  onBlur={(e) => {
                    const terms = e.target.value
                      .split(/[,\s]+/)
                      .map(Number)
                      .filter((n) => n > 0 && n <= 120)
                    if (terms.length) set({ finance: { ...s.finance, terms: [...new Set(terms)].sort((a, b) => a - b) } })
                  }}
                />
              )}
            </Field>
            <div className="field">
              <span className="label">VAT 7%</span>
              <Segmented
                ariaLabel="VAT"
                value={s.finance.vat ? 'y' : 'n'}
                onChange={(v) => set({ finance: { ...s.finance, vat: v === 'y' } })}
                options={[
                  { value: 'y', label: 'รวมในค่างวด' },
                  { value: 'n', label: 'ไม่รวม' },
                ]}
              />
            </div>
          </div>
        </fieldset>

        </fieldset>
        <div className="form-actions sticky-actions">
          <button type="button" className="btn" disabled={!dirty} onClick={() => {
              setS(settings)
              setBase(settings)
            }}>
            คืนค่า
          </button>
          <button type="submit" className="btn btn-primary" disabled={!dirty}>
            บันทึกการตั้งค่า
          </button>
        </div>
      </form>
      ) : (
        <p className="muted small staff-note">การตั้งค่าเต็นท์ (ราคาเริ่มต้น ไฟแนนซ์ เลขสต็อก) แก้ได้เฉพาะเจ้าของ</p>
      )}

      <fieldset className="block">
        <legend>ข้อมูล</legend>
        <p className="muted small">ข้อมูลเก็บบน Supabase ใช้ร่วมกันทุกคนในเต็นท์ · รถ {cars.length} คัน</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportCsv} disabled={!cars.length}>
            <Icon name="download" /> ส่งออก CSV (เปิดใน Excel)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => download(`lanrot-backup-${todayISO()}.json`, JSON.stringify({ ...snapshot(), cars: snapshot().cars.map((c) => ({ ...c, photoUrl: null })) }, null, 1), 'application/json')}
          >
            <Icon name="download" /> สำรองข้อมูล (JSON)
          </button>
          {owner && (
            <button type="button" className="btn" onClick={() => file.current?.click()}>
              <Icon name="upload" /> นำเข้าไฟล์สำรอง
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const n = await importBackup(JSON.parse(await f.text()))
                toast(`นำเข้า ${n} คันแล้ว`)
              } catch (err) {
                toast('นำเข้าไม่สำเร็จ: ' + (err as Error).message)
              }
            }}
          />
        </div>
      </fieldset>

      <ShopsSection />

      {!isStandalone() && (
        <fieldset className="block">
          <legend>ใช้บนมือถือ</legend>
          {canInstall ? (
            <>
              <p className="muted small">ติดตั้งลงหน้าจอโฮม เปิดได้เหมือนแอปทั่วไป เต็มจอ ไม่มีแถบเบราว์เซอร์</p>
              <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
                <Icon name="download" /> ติดตั้งแอป
              </button>
            </>
          ) : isIOS() ? (
            <ol className="install-steps">
              <li>เปิดหน้านี้ใน Safari</li>
              <li>
                กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ด้านล่างจอ
              </li>
              <li>
                เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วกด <b>เพิ่ม</b>
              </li>
            </ol>
          ) : (
            <ol className="install-steps">
              <li>เปิดหน้านี้ใน Chrome บนมือถือ</li>
              <li>
                กดเมนู <b>⋮</b> มุมขวาบน แล้วเลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b>
              </li>
            </ol>
          )}
        </fieldset>
      )}

      <fieldset className="block">
        <legend>บัญชี {user?.email}</legend>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const { error } = await supabase.auth.updateUser({ password: pw })
            toast(error ? 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + error.message : 'เปลี่ยนรหัสผ่านแล้ว')
            if (!error) setPw('')
          }}
        >
          <input type="password" aria-label="รหัสผ่านใหม่" placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit" className="btn" disabled={pw.length < 6}>
            เปลี่ยนรหัสผ่าน
          </button>
        </form>
        <button type="button" className="btn signout" onClick={() => void signOut()}>
          ออกจากระบบ
        </button>
      </fieldset>
    </div>
  )
}
