import { useSyncExternalStore } from 'react'
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import type { AppData, Car, CarStatus, Expense, Invite, Member, Membership, PricingPlan, Reservation, Role, Settings } from './types'
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
  /** โหลดรายชื่อเต็นท์ที่เป็นสมาชิกแล้ว */
  shopsReady: boolean
  loaded: boolean
  memberships: Membership[]
  shopId: string | null
  role: Role | null
  members: Member[]
  /** คำเชิญที่เจ้าของเต็นท์ส่งออกไป (ยังไม่มีคนรับ) */
  invites: Invite[]
  /** คำเชิญที่ส่งมาถึงอีเมลของเรา */
  myInvites: Invite[]
  cars: Car[]
  settings: Settings
  pending: number
  error: string | null
}

const initial = (): State => ({
  user: null,
  authReady: false,
  shopsReady: false,
  loaded: false,
  memberships: [],
  shopId: null,
  role: null,
  members: [],
  invites: [],
  myInvites: [],
  cars: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  pending: 0,
  error: null,
})

let state: State = initial()

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
  shop_id?: string
  created_by?: string | null
  updated_by?: string | null
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
  shop_id?: string
  created_by?: string | null
  created_at?: string
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

function rowToExpense(r: ExpenseRow): Expense {
  return { id: r.id, category: r.category, label: r.label, amount: num(r.amount), date: r.date ?? '', vendor: r.vendor, createdBy: r.created_by ?? null }
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
    createdBy: r.created_by ?? null,
    updatedBy: r.updated_by ?? null,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  }
}

function carToRow(c: Car): Omit<CarRow, 'created_at' | 'updated_at' | 'expenses'> {
  return {
    id: c.id,
    shop_id: state.shopId!,
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
  return { id: e.id, car_id: carId, shop_id: state.shopId!, category: e.category, label: e.label, amount: e.amount, date: e.date || null, vendor: e.vendor }
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

/** สำหรับคำสั่งที่หน้าจอรอผล (จัดการทีม) — โยน error ให้หน้าจอแสดงเอง */
async function call<T>(op: () => PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  set({ pending: state.pending + 1 })
  try {
    const { data, error } = await op()
    if (error) throw new Error(error.message)
    return data
  } finally {
    set({ pending: state.pending - 1 })
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

const SHOP_KEY = 'lanrot.shop'

function rememberShop(id: string | null) {
  try {
    if (id) localStorage.setItem(SHOP_KEY, id)
    else localStorage.removeItem(SHOP_KEY)
  } catch {
    /* ignore */
  }
}

function lastShop(): string | null {
  try {
    return localStorage.getItem(SHOP_KEY)
  } catch {
    return null
  }
}

interface InviteRow {
  id: string
  shop_id: string
  shop_name: string
  email: string
  role: Role
}
const rowToInvite = (r: InviteRow): Invite => ({ id: r.id, shopId: r.shop_id, shopName: r.shop_name, email: r.email, role: r.role })

/** โหลดว่าเราอยู่เต็นท์ไหนบ้าง และมีคำเชิญค้างอยู่ไหม แล้วเลือกเต็นท์ที่จะเปิด */
export async function loadShops(preferred?: string | null): Promise<void> {
  const user = state.user
  if (!user) return
  const [memRes, invRes] = await Promise.all([
    supabase.from('shop_members').select('shop_id, role, shops(name)').eq('user_id', user.id),
    supabase.from('shop_invites').select('id, shop_id, shop_name, email, role'),
  ])
  if (memRes.error || invRes.error) {
    set({ shopsReady: true, loaded: true, error: 'โหลดข้อมูลเต็นท์ไม่สำเร็จ: ' + (memRes.error ?? invRes.error)!.message })
    return
  }
  const memberships: Membership[] = (memRes.data as unknown as { shop_id: string; role: Role; shops: { name: string } | null }[]).map((m) => ({
    shopId: m.shop_id,
    shopName: m.shops?.name ?? '',
    role: m.role,
  }))
  const email = (user.email ?? '').toLowerCase()
  const myInvites = (invRes.data as InviteRow[])
    .filter((i) => i.email.toLowerCase() === email && !memberships.some((m) => m.shopId === i.shop_id))
    .map(rowToInvite)
  const want = preferred ?? state.shopId ?? lastShop()
  const current = memberships.find((m) => m.shopId === want) ?? memberships[0] ?? null
  const changed = current?.shopId !== state.shopId
  set({
    memberships,
    myInvites,
    shopId: current?.shopId ?? null,
    role: current?.role ?? null,
    shopsReady: true,
    ...(changed ? { cars: [], members: [], invites: [], loaded: false } : {}),
  })
  rememberShop(current?.shopId ?? null)
  if (current) {
    subscribeShop(current.shopId)
    await reload()
  } else {
    subscribeShop(null)
    set({ loaded: true })
  }
}

interface ShopRow {
  id: string
  name: string
  settings: Partial<Settings>
  stock_prefix: string
  next_stock_no: number
}

export async function reload(): Promise<void> {
  const shopId = state.shopId
  if (!state.user || !shopId) return
  const [carsRes, shopRes, memRes, invRes] = await Promise.all([
    supabase.from('cars').select('*, expenses(*)').eq('shop_id', shopId).order('created_at', { ascending: false }),
    supabase.from('shops').select('id, name, settings, stock_prefix, next_stock_no').eq('id', shopId).maybeSingle(),
    supabase.from('shop_members').select('user_id, role, email, name').eq('shop_id', shopId).order('created_at'),
    supabase.from('shop_invites').select('id, shop_id, shop_name, email, role').eq('shop_id', shopId),
  ])
  const err = carsRes.error ?? shopRes.error ?? memRes.error ?? invRes.error
  if (err) {
    set({ loaded: true, error: 'โหลดข้อมูลไม่สำเร็จ: ' + err.message })
    return
  }
  if (!shopRes.data) {
    // ถูกเอาออกจากเต็นท์ หรือเต็นท์ถูกลบ
    rememberShop(null)
    set({ shopId: null })
    return loadShops(null)
  }
  if (state.shopId !== shopId) return // ผู้ใช้สลับเต็นท์ระหว่างโหลด
  const shop = shopRes.data as ShopRow
  const raw = shop.settings ?? {}
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    shopName: shop.name,
    stockPrefix: shop.stock_prefix,
    nextStockNo: shop.next_stock_no,
    defaultPricing: { ...DEFAULT_SETTINGS.defaultPricing, ...raw.defaultPricing },
    finance: { ...DEFAULT_SETTINGS.finance, ...raw.finance },
  }
  state = { ...state, settings }
  const members: Member[] = (memRes.data as { user_id: string; role: Role; email: string; name: string }[]).map((m) => ({
    userId: m.user_id,
    role: m.role,
    email: m.email,
    name: m.name,
  }))
  const me = members.find((m) => m.userId === state.user?.id)
  const cars = await signPhotos((carsRes.data as CarRow[]).map(rowToCar))
  set({
    cars,
    settings,
    members,
    role: me?.role ?? state.role,
    invites: (invRes.data as InviteRow[]).map(rowToInvite),
    memberships: state.memberships.map((m) => (m.shopId === shopId ? { ...m, shopName: shop.name, role: me?.role ?? m.role } : m)),
    loaded: true,
  })
}

/* ---------- realtime: เพื่อนร่วมทีมแก้อะไร หน้าจอเราอัปเดตตาม ---------- */

let channel: RealtimeChannel | null = null
let realtimeTimer: number | undefined

function scheduleReload() {
  window.clearTimeout(realtimeTimer)
  realtimeTimer = window.setTimeout(() => {
    // ถ้าเรากำลังบันทึกอยู่ รอให้เสร็จก่อน จะได้ไม่เขียนทับสิ่งที่เพิ่งพิมพ์
    if (state.pending > 0) scheduleReload()
    else void reload()
  }, 600)
}

function subscribeShop(shopId: string | null) {
  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
  if (!shopId) return
  channel = supabase
    .channel(`shop-${shopId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cars', filter: `shop_id=eq.${shopId}` }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `shop_id=eq.${shopId}` }, scheduleReload)
    .subscribe()
}

export function initAuth() {
  supabase.auth.getSession().then(({ data }) => {
    set({ user: data.session?.user ?? null, authReady: true })
    if (data.session) void loadShops()
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    const prev = state.user?.id
    const next = session?.user ?? null
    if (!next) {
      subscribeShop(null)
      state = { ...initial(), authReady: true }
      set({})
      return
    }
    set({ user: next, authReady: true })
    if (next.id !== prev) void loadShops()
  })
  // กลับมาที่แอป (สลับแอปบนมือถือ) แล้วดึงข้อมูลล่าสุด เผื่อ realtime หลุดตอนจอดับ
  let last = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.pending === 0 && Date.now() - last > 30_000) {
      last = Date.now()
      void loadShops()
    }
  })
}

export async function signOut() {
  rememberShop(null)
  await supabase.auth.signOut()
}

/* ---------------- เต็นท์และทีม ---------------- */

export function isOwner(): boolean {
  return state.role === 'owner'
}

export function useIsOwner(): boolean {
  return useStore((s) => s.role === 'owner')
}

export function memberName(userId: string | null | undefined): string {
  if (!userId) return ''
  const m = state.members.find((x) => x.userId === userId)
  if (!m) return 'อดีตสมาชิก'
  return m.name || m.email.split('@')[0]
}

export async function createShop(name: string): Promise<void> {
  const id = await call(() => supabase.rpc('create_shop', { p_name: name }))
  await loadShops(id as string)
}

export async function switchShop(shopId: string): Promise<void> {
  if (shopId === state.shopId) return
  set({ shopId, loaded: false, cars: [], members: [], invites: [] })
  await loadShops(shopId)
}

export async function acceptInvite(inviteId: string): Promise<void> {
  const shopId = await call(() => supabase.rpc('accept_invite', { p_invite: inviteId }))
  await loadShops(shopId as string)
}

export async function declineInvite(inviteId: string): Promise<void> {
  await call(() => supabase.from('shop_invites').delete().eq('id', inviteId))
  set({ myInvites: state.myInvites.filter((i) => i.id !== inviteId) })
}

export async function inviteMember(email: string, role: Role): Promise<void> {
  const clean = email.trim().toLowerCase()
  if (state.members.some((m) => m.email.toLowerCase() === clean)) throw new Error('อีเมลนี้อยู่ในทีมแล้ว')
  await call(() =>
    supabase.from('shop_invites').upsert(
      { shop_id: state.shopId, shop_name: state.settings.shopName, email: clean, role },
      { onConflict: 'shop_id,email' },
    ),
  )
  await reload()
}

export async function cancelInvite(inviteId: string): Promise<void> {
  await call(() => supabase.from('shop_invites').delete().eq('id', inviteId))
  set({ invites: state.invites.filter((i) => i.id !== inviteId) })
}

export async function setMemberRole(userId: string, role: Role): Promise<void> {
  await call(() => supabase.from('shop_members').update({ role }).eq('shop_id', state.shopId!).eq('user_id', userId))
  await reload()
}

export async function removeMember(userId: string): Promise<void> {
  await call(() => supabase.from('shop_members').delete().eq('shop_id', state.shopId!).eq('user_id', userId))
  if (userId === state.user?.id) {
    rememberShop(null)
    set({ shopId: null })
    await loadShops(null)
  } else await reload()
}

export async function setMyName(name: string): Promise<void> {
  await call(() => supabase.from('shop_members').update({ name: name.trim() }).eq('shop_id', state.shopId!).eq('user_id', state.user!.id))
  await reload()
}

/* ---------------- คำสั่งแก้ไขข้อมูลรถ ---------------- */

export function uid(): string {
  return crypto.randomUUID()
}

/** เลขสต็อกถัดไปที่ฐานข้อมูลจะออกให้ (แสดงเป็นตัวอย่างในฟอร์ม) */
export function nextStockPreview(): string {
  const s = state.settings
  return `${s.stockPrefix}-${String(s.nextStockNo).padStart(3, '0')}`
}

export function newCar(): Car {
  const s = state.settings
  return {
    id: uid(),
    stockNo: '', // ว่าง = ให้ฐานข้อมูลออกเลขให้
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
    createdBy: state.user?.id ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function putLocal(car: Car) {
  const stamped = { ...car, updatedAt: Date.now(), updatedBy: state.user?.id ?? null }
  const exists = state.cars.some((c) => c.id === car.id)
  set({ cars: exists ? state.cars.map((c) => (c.id === car.id ? stamped : c)) : [stamped, ...state.cars] })
}

/** บันทึกข้อมูลตัวรถ (ไม่รวมรายการค่าใช้จ่าย ซึ่งใช้ addExpense/removeExpense) */
export function saveCar(car: Car) {
  const needsNo = !car.stockNo.trim()
  putLocal(needsNo ? { ...car, stockNo: nextStockPreview() } : car)
  if (needsNo) {
    // ให้ฐานข้อมูลออกเลขสต็อก แล้วเอาเลขจริงกลับมาแสดง
    state = { ...state, settings: { ...state.settings, nextStockNo: state.settings.nextStockNo + 1 } }
    void remote('บันทึกรถ', async () => {
      const res = await supabase.from('cars').upsert(carToRow({ ...car, stockNo: '' })).select('stock_no').single()
      if (!res.error && res.data) {
        const cur = state.cars.find((c) => c.id === car.id)
        if (cur) set({ cars: state.cars.map((c) => (c.id === car.id ? { ...c, stockNo: (res.data as { stock_no: string }).stock_no } : c)) })
      }
      return res
    })
    return
  }
  void remote('บันทึกรถ', () => supabase.from('cars').upsert(carToRow(car)))
}

export function updateCar(id: string, patch: (c: Car) => Car) {
  const car = state.cars.find((c) => c.id === id)
  if (car) saveCar(patch(car))
}

export function deleteCar(id: string) {
  const car = state.cars.find((c) => c.id === id)
  set({ cars: state.cars.filter((c) => c.id !== id) })
  void remote('ลบรถ', () => supabase.from('cars').delete().eq('id', id).select('id').single())
  if (car?.photoPath) void supabase.storage.from(PHOTO_BUCKET).remove([car.photoPath])
}

export function addExpense(carId: string, e: Expense) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car) return
  putLocal({ ...car, expenses: [...car.expenses, { ...e, createdBy: state.user?.id ?? null }] })
  void remote('เพิ่มค่าใช้จ่าย', () => supabase.from('expenses').insert(expenseToRow(carId, e)))
}

export function updateExpense(carId: string, e: Expense) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car) return
  putLocal({ ...car, expenses: car.expenses.map((x) => (x.id === e.id ? e : x)) })
  void remote('แก้ไขค่าใช้จ่าย', () => supabase.from('expenses').update(expenseToRow(carId, e)).eq('id', e.id))
}

/** ลบได้ถ้าเป็นเจ้าของ หรือเป็นคนลงรายการนั้นเอง (ตรงกับ RLS) */
export function canDeleteExpense(e: Expense): boolean {
  return state.role === 'owner' || e.createdBy === state.user?.id
}

export function removeExpense(carId: string, expenseId: string) {
  const car = state.cars.find((c) => c.id === carId)
  if (!car) return
  putLocal({ ...car, expenses: car.expenses.filter((x) => x.id !== expenseId) })
  void remote('ลบค่าใช้จ่าย', () => supabase.from('expenses').delete().eq('id', expenseId).select('id').single())
}

export function saveSettings(settings: Settings) {
  const prevNo = state.settings.nextStockNo
  set({ settings, memberships: state.memberships.map((m) => (m.shopId === state.shopId ? { ...m, shopName: settings.shopName } : m)) })
  const { shopName, stockPrefix, nextStockNo, ...rest } = settings
  const row: Record<string, unknown> = { name: shopName, stock_prefix: stockPrefix || 'A', settings: rest }
  if (nextStockNo !== prevNo) row.next_stock_no = nextStockNo
  void remote('บันทึกการตั้งค่า', () => supabase.from('shops').update(row).eq('id', state.shopId!))
}

export async function uploadPhoto(carId: string, blob: Blob): Promise<void> {
  if (!state.user || !state.shopId) return
  const path = `${state.shopId}/${carId}-${Date.now()}.jpg`
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

/** นำเข้าไฟล์สำรอง (JSON) เข้าเต็นท์ปัจจุบัน — รถที่ id ซ้ำจะถูกเขียนทับ */
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
  } finally {
    set({ pending: state.pending - 1 })
  }
  await reload()
  return cars.length
}
