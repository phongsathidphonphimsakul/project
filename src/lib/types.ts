export type CarStatus = 'stock' | 'prep' | 'ready' | 'reserved' | 'sold'

export const STATUS_LABEL: Record<CarStatus, string> = {
  stock: 'เพิ่งซื้อเข้า',
  prep: 'กำลังเตรียมรถ',
  ready: 'พร้อมขาย',
  reserved: 'ติดจอง',
  sold: 'ขายแล้ว',
}

export const STATUS_ORDER: CarStatus[] = ['stock', 'prep', 'ready', 'reserved', 'sold']

export interface Expense {
  id: string
  category: string
  label: string
  amount: number
  date: string // yyyy-mm-dd
  vendor: string
  createdBy?: string | null
}

/**
 * markup  = กำไรคิดเป็น % ของต้นทุน
 * margin  = กำไรคิดเป็น % ของราคาขาย
 * profit  = ใส่กำไรที่ต้องการเป็นบาท
 */
export type PricingMode = 'markup' | 'margin' | 'profit'

export type Rounding = 'none' | '1000' | '5000' | '10000' | 'end9'

export interface PricingPlan {
  mode: PricingMode
  value: number
  buffer: number // เผื่อให้ลูกค้าต่อราคา (บาท)
  rounding: Rounding
}

export interface Reservation {
  name: string
  phone: string
  deposit: number
  date: string
}

export interface Sale {
  price: number
  date: string
  buyer: string
  phone: string
  note: string
}

export interface Car {
  id: string
  stockNo: string
  brand: string
  model: string
  subModel: string
  year: number | null
  color: string
  gear: 'AT' | 'MT' | ''
  fuel: string
  mileage: number | null
  plate: string
  province: string
  vin: string
  purchaseDate: string
  purchasePrice: number
  purchasedFrom: string
  status: CarStatus
  expenses: Expense[]
  pricing: PricingPlan
  askingPrice: number | null
  reservation: Reservation | null
  sale: Sale | null
  notes: string
  photoPath: string | null // path ใน Supabase Storage
  photoUrl: string | null // signed URL (สร้างตอนโหลด ไม่บันทึกลงฐานข้อมูล)
  createdBy?: string | null
  updatedBy?: string | null
  createdAt: number
  updatedAt: number
}

export type Role = 'owner' | 'staff'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'เจ้าของ',
  staff: 'พนักงาน',
}

export interface Membership {
  shopId: string
  shopName: string
  role: Role
}

export interface Member {
  userId: string
  email: string
  name: string
  role: Role
}

export interface Invite {
  id: string
  shopId: string
  shopName: string
  email: string
  role: Role
}

export interface Settings {
  shopName: string
  shopPhone: string
  defaultPricing: PricingPlan
  agingWarnDays: number
  finance: { downPct: number; ratePct: number; vat: boolean; terms: number[] }
  stockPrefix: string
  nextStockNo: number
}

export interface AppData {
  version: 1
  cars: Car[]
  settings: Settings
}
