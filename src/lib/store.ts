import { useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AppData, Car, CarStatus, Expense, PricingPlan, Reservation, Settings } from './types'
import { todayISO } from './calc'
import { PHOTO_BUCKET, supabase } from './supabase'

export const DEFAULT_SETTINGS: Settings = {
  shopName: '',
  shopPhone: '',
  defaultPricing: { mode: 'profit', value: 40_000, buffer: 10_000, rounding: 'end9' },
  agingWarnDays: 60,
  finance: { downPct: 20, ratePct: 3.5, vat: true, terms: [48, 60, 72, 84] },
  stockPrefix: 'A',
  nextStockNo: 1,
}

interface State {
  user: User | null
  authReady: boolean
  loaded: boolean
  cars: Car[]
  settings: Settings
  pending: number
  error: string | null
}

let state: State = {
  user: null,
  authReady: false,
  loaded: false,
  cars: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  pending: 0,
  error: null,
}

const listeners = new Set<() => void>()
function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state))
}

export function useData(): AppData {
  const cars = useStore((s) => s.cars)
  const settings = useStore((s) => s.settings)
  return { version: 1, cars, settings }
}

export function snapshot(): AppData {
  return { version: 1, cars: state.cars, settings: state.settings }
}

/* ---------------- แปลงแถวในฐานข้อมูล <-> object ในแอป ---------------- */

interface CarRow {
  id: string
  stock_no: string
  brand: string
  model: string
  sub_model: string
  year: number | null
  color: string
  gear: string
  fuel: string
  mileage: number | null
  plate: string
  province: string
  vin: string
  purchase_date: string | null
  purchase_price: number
  purchased_from: string
  status: CarStatus
  pricing: Partial<PricingPlan>
  asking_price: number | null
  reservation: Reservation | null
  sold_price: number | null
  sold_date: string | null
  buyer_name: string | null
  buyer_phone: string | null
  sale_note: string | null
  notes: string
  photo_path: string | null
  created_at: string
  updated_at: string
  expenses?: ExpenseRow[]
}

interface ExpenseRow {
  id: string
  car_id: string
  category: string
  label: string
  amount: number
  date: string | null
  vendor: string
  created_at?: string
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

function rowToExpense(r: ExpenseRow): Expense {
  return { id: r.id, category: r.category, label: r.label, amount: num(r.amount), date: r.date ?? '', vendor: r.vendor }
}

function rowToCar(r: CarRow): Car {
  const expenses = (r.expenses ?? [])
    .slice()
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map(rowToExpense)
  return {
    id: r.id,
    stockNo: r.stock_no,
    brand: r.brand,
    model: r.model,
    subModel: r.sub_model,
    year: r.year,
    color: r.color,
    gear: (r.gear as Car['gear']) || '',
    fuel: r.fuel,
    mileage: r.mileage,
    plate: r.plate,
    province: r.province,
    vin: r.vin,
    purchaseDate: r.purchase_date ?? '',
    purchasePrice: num(r.purchase_price),
    purchasedFrom: r.purchased_from,
    status: r.status,
    expenses,
    pricing: { ...state.settings.defaultPricing, ...r.pricing },
    askingPrice: numOrNull(r.asking_price),
    reservation: r.reservation,
    sale:
      r.sold_price != null
        ? { price: num(r.sold_price), date: r.sold_date ?? '', buyer: r.buyer_name ?? '', phone: r.buyer_phone ?? '', note: r.sale_note ?? '' }
        : null,
    notes: r.notes,
    photoPath: r.photo_path,
    photoUrl: null,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  }
}

function carToRow(c: Car): Omit<CarRow, 'created_at' | 'updated_at' | 'expenses'> {
  return {
    id: c.id,
    stock_no: c.stockNo,
    brand: c.brand,
    model: c.model,
    sub_model: c.subModel,
    year: c.year,
    color: c.color,
    gear: c.gear,
    fuel: c.fuel,
    mileage: c.mileage,
    plate: c.plate,
    province: c.province,
    vin: c.vin,
    purchase_date: c.purchaseDate || null,
    purchase_price: c.purchasePrice,
    purchased_from: c.purchasedFrom,
    status: c.status,
    pricing: c.pricing,
    asking_price: c.askingPrice,
    reservation: c.reservation,
    sold_price: c.sale?.price ?? null,
    sold_date: c.sale?.date || null,
    buyer_name: c.sale?.buyer ?? null,
    buyer_phone: c.sale?.phone ?? null,
    sale_note: c.sale?.note ?? null,
    notes: c.notes,
    photo_path: c.photoPath,
  }
}

function expenseToRow(carId: string, e: Expense): ExpenseRow {
  return { id: e.id, car_id: carId, category: e.category, label: e.label, amount: e.amount, date: e.date || null, vendor: e.vendor }
}

/* ---------------- ซิงก์กับเซิร์ฟเวอร์ ---------------- */

/** รันคำสั่งไปยัง Supabase แบบ optimistic: หน้าจออัปเดตก่อน ถ้าพังจะแจ้งและโหลดข้อมูลจริงกลับมา */
async function remote(label: string, op: () => PromiseLike<{ error: { message: string } | null }>) {
  set({ pending: state.pending + 1 })
  try {
    const { error } = await op()
    if (error) throw new Error(error.message)
    set({ pending: state.pending - 1 })
  } catch (err) {
    set({ pending: state.pending - 1, error: `${label}ไม่สำเร็จ: ${(err as Error).message}` })
    void reload()
  }
}

export function clearError() {
  set({ error: null })
}

async function signPhotos(cars: Car[]): Promise<Car[]> {
  const paths = cars.map((c) => c.photoPath).filter((p): p is string => !!p)
  if (!paths.length) return cars
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60 * 12)
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  return cars.map((c) => (c.photoPath ? { ...c, photoUrl: map.get(c.photoPath) ?? null } : c))
}

export async function reload(): Promise<void> {
  if (!state.user) return
  const [carsRes, setRes] = await Promise.all([
    supabase.from('cars').select('*, expenses(*)').order('created_at', { ascending: false }),
    supabase.from('settings').select('data').maybeSingle(),
  ])
  if (carsRes.error || setRes.error) {
    set({ loaded: true, error: 'โหลดข้อมูลไม่สำเร็จ: ' + (carsRes.error ?? setRes.error)!.message })
    return
  }
  const raw = (setRes.data?.data ?? {}) as Partial<Settings>
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    defaultPricing: { ...DEFAULT_SETTINGS.defaultPricing, ...raw.defaultPricing },
    finance: { ...DEFAULT_SETTINGS.finance, ...raw.finance },
  }
  state = { ...state, settings }
  const cars = await signPhotos((carsRes.data as CarRow[]).map(rowToCar))
  set({ cars, settings, loaded: true })
}

export function initAuth() {
  supabase.auth.getSession().then(({ data }) => {
    set({ user: data.session?.user ?? null, authReady: true })
    if (data.session) void reload()
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    const prev = state.user?.id
    const next = session?.user ?? null
    set({ user: next, authReady: true })
    if (next && next.id !== prev) void reload()
    if (!next) set({ cars: [], settings: structuredClone(DEFAULT_SETTINGS), loaded: false })
  })
  // เปิดหลายเครื่อง/หลายแท็บ: กลับมาที่แท็บนี้แล้วดึงข้อมูลล่าสุด
  let last = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.pending === 0 && Date.now() - last > 30_000) {
      last = Date.now()
      void reload()
    }
  })
}

export async function signOut() {
  await supabase.auth.signOut()
}

/* ---------------- คำสั่งแก้ไขข้อมูล ---------------- */

export function uid(): string {
  return crypto.randomUUID()
}

function autoStockNo(s: Settings) {
  return `${s.stockPrefix}-${String(s.nextStockNo).padStart(3, '0')}`
}

export function newCar(): Car {
  const s = state.settings
  return {
    id: uid(),
    stockNo: autoStockNo(s),
    brand: '',
    model: '',
    subModel: '',
    year: null,
    color: '',
    gear: 'AT',
    fuel: 'เบนซิน',
    mileage: null,
    plate: '',
    province: '',
    vin: '',
    purchaseDate: todayISO(),
    purchasePrice: 0,
    purchasedFrom: '',
    status: 'stock',
    expenses: [],
    pricing: { ...s.defaultPricing },
    askingPrice: null,
    reservation: null,
    sale: null,
    notes: '',
    photoPath: null,
    photoUrl: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function putLocal(car: Car) {
  const stamped = { ...car, updatedAt: Date.now() }
  const exists = state.cars.some((c) => c.id === car.id)
  set({ cars: exists ? state.cars.map((c) => (c.id === car.id ? stamped : c)) : [stamped, ...state.cars] })
}

/** บันทึกข้อมูลตัวรถ (ไม่รวมรายการค่าใช้จ่าย ซึ่งใช้ addExpense/removeExpense) */
export function saveCar(car: Car) {
  const isNew = !state.cars.some((c) => c.id === car.id)
  putLocal(car)
  void remote('บันทึกรถ', () => supabase.from('cars').upsert(carToRow(car)))
  if (isNew && car.stockNo === autoStockNo(state.settings)) {
    saveSettings({ ...state.settings, nextStockNo: state.settings.nextStockNo + 1 })
  }
}

export function updateCar(id: string, patch: (c: Car) => Car) {
  const car = state.cars.find((c) => c.id === id)
  if (car) saveCar(patch(car))
}

export function deleteCar(id: string) {
  const car = state.cars.find((c) => c.id === id)
  set({ cars: state.cars.filter((c) => c.id !== id) })
  void remote('ลบรถ', () => supabase.from('cars').delete().eq('id', id))
  if (car?.photoPath) void supabase.storage.from(PHOTO_BUCKET).remove([car.photoPath])
}

export function addExpense(carId: string, e: Expense) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car) return
  putLocal({ ...car, expenses: [...car.expenses, e] })
  void remote('เพิ่มค่าใช้จ่าย', () => supabase.from('expenses').insert(expenseToRow(carId, e)))
}

export function updateExpense(carId: string, e: Expense) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car) return
  putLocal({ ...car, expenses: car.expenses.map((x) => (x.id === e.id ? e : x)) })
  void remote('แก้ไขค่าใช้จ่าย', () => supabase.from('expenses').update(expenseToRow(carId, e)).eq('id', e.id))
}

export function removeExpense(carId: string, expenseId: string) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car) return
  putLocal({ ...car, expenses: car.expenses.filter((x) => x.id !== expenseId) })
  void remote('ลบค่าใช้จ่าย', () => supabase.from('expenses').delete().eq('id', expenseId))
}

export function saveSettings(settings: Settings) {
  set({ settings })
  void remote('บันทึกการตั้งค่า', () => supabase.from('settings').upsert({ user_id: state.user!.id, data: settings }))
}

export async function uploadPhoto(carId: string, blob: Blob): Promise<void> {
  const user = state.user
  if (!user) return
  const path = `${user.id}/${carId}-${Date.now()}.jpg`
  set({ pending: state.pending + 1 })
  try {
    const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (up.error) throw up.error
    const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60 * 12)
    const car = state.cars.find((c) => c.id === carId)
    const old = car?.photoPath
    if (car) {
      const next = { ...car, photoPath: path, photoUrl: signed.data?.signedUrl ?? URL.createObjectURL(blob) }
      putLocal(next)
      const res = await supabase.from('cars').update({ photo_path: path }).eq('id', carId)
      if (res.error) throw res.error
    }
    if (old) void supabase.storage.from(PHOTO_BUCKET).remove([old])
    set({ pending: state.pending - 1 })
  } catch (err) {
    set({ pending: state.pending - 1, error: 'อัปโหลดรูปไม่สำเร็จ: ' + (err as Error).message })
  }
}

export function removePhoto(carId: string) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car?.photoPath) return
  const path = car.photoPath
  putLocal({ ...car, photoPath: null, photoUrl: null })
  void remote('ลบรูป', () => supabase.from('cars').update({ photo_path: null }).eq('id', carId))
  void supabase.storage.from(PHOTO_BUCKET).remove([path])
}

/** นำเข้าไฟล์สำรอง (JSON) — รถที่ id ซ้ำจะถูกเขียนทับ */
export async function importBackup(raw: unknown): Promise<number> {
  const data = raw as Partial<AppData>
  if (!data || !Array.isArray(data.cars)) throw new Error('ไฟล์ไม่ใช่ข้อมูลสำรองของแอปนี้')
  const cars = data.cars as Car[]
  const carRows = cars.map((c) => carToRow({ ...newCar(), ...c, photoPath: null, photoUrl: null }))
  const expRows = cars.flatMap((c) => (c.expenses ?? []).map((e) => expenseToRow(c.id, e)))
  set({ pending: state.pending + 1 })
  try {
    for (let i = 0; i < carRows.length; i += 200) {
      const r = await supabase.from('cars').upsert(carRows.slice(i, i + 200))
      if (r.error) throw r.error
    }
    for (let i = 0; i < expRows.length; i += 500) {
      const r = await supabase.from('expenses').upsert(expRows.slice(i, i + 500))
      if (r.error) throw r.error
    }
    if (data.settings) {
      const r = await supabase.from('settings').upsert({ user_id: state.user!.id, data: { ...state.settings, ...data.settings } })
      if (r.error) throw r.error
    }
  } finally {
    set({ pending: state.pending - 1 })
  }
  await reload()
  return cars.length
}
