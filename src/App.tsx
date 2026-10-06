import { useEffect } from 'react'
import { useRoute, go, type Route } from './lib/router'
import { clearError, signOut, switchShop, useData, useStore } from './lib/store'
import { isConfigured } from './lib/supabase'
import { Icon, Toaster } from './components/ui'
import Dashboard from './pages/Dashboard'
import CarList from './pages/CarList'
import CarForm from './pages/CarForm'
import CarDetail from './pages/CarDetail'
import PrintTag from './pages/PrintTag'
import Appraise from './pages/Appraise'
import SettingsPage from './pages/Settings'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Onboarding from './pages/Onboarding'

const NAV: { key: Route['name']; href: string; label: string; icon: string }[] = [
  { key: 'dashboard', href: '#/', label: 'ภาพรวม', icon: 'grid' },
  { key: 'cars', href: '#/cars', label: 'รถในเต็นท์', icon: 'list' },
  { key: 'appraise', href: '#/appraise', label: 'ประเมินก่อนซื้อ', icon: 'calc' },
  { key: 'settings', href: '#/settings', label: 'ตั้งค่าและทีม', icon: 'gear' },
]

function isActive(route: Route, key: Route['name']) {
  if (key === 'cars') return ['cars', 'car', 'edit', 'new'].includes(route.name)
  return route.name === key
}

function SyncBadge() {
  const pending = useStore((s) => s.pending)
  return (
    <span className="sync" data-busy={pending > 0 ? '' : undefined}>
      <i aria-hidden="true" />
      {pending > 0 ? 'กำลังบันทึก…' : 'บันทึกแล้ว'}
    </span>
  )
}

function ErrorBar() {
  const error = useStore((s) => s.error)
  if (!error) return null
  return (
    <div className="errorbar" role="alert">
      <span>{error}</span>
      <button type="button" className="link" onClick={clearError}>
        ปิด
      </button>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const authReady = useStore((s) => s.authReady)
  const user = useStore((s) => s.user)
  const loaded = useStore((s) => s.loaded)
  const shopsReady = useStore((s) => s.shopsReady)
  const shopId = useStore((s) => s.shopId)
  const memberships = useStore((s) => s.memberships)
  const myInvites = useStore((s) => s.myInvites)
  const { cars, settings } = useData()

  useEffect(() => {
    document.title = settings.shopName ? `${settings.shopName} · ลานรถ` : 'ลานรถ — ต้นทุนและราคาขายรถ'
  }, [settings.shopName])

  if (!isConfigured) return <Setup />
  if (!authReady) return <div className="boot">กำลังเปิด…</div>
  if (!user) return <Login />
  if (!shopsReady) return <div className="boot">กำลังโหลดข้อมูล…</div>
  if (!shopId) return <Onboarding />

  if (route.name === 'print') {
    if (!loaded) return <div className="boot">กำลังโหลดข้อมูล…</div>
    return <PrintTag id={route.id} />
  }

  const inStock = cars.filter((c) => c.status !== 'sold').length

  let page
  if (!loaded) page = <div className="boot">กำลังโหลดข้อมูล…</div>
  else
    switch (route.name) {
      case 'dashboard':
        page = <Dashboard />
        break
      case 'cars':
        page = <CarList />
        break
      case 'new':
        page = <CarForm />
        break
      case 'edit':
        page = <CarForm id={route.id} />
        break
      case 'car':
        page = <CarDetail id={route.id} />
        break
      case 'appraise':
        page = <Appraise />
        break
      case 'settings':
        page = <SettingsPage />
        break
    }

  return (
    <div className="shell">
      <aside className="rail">
        <a href="#/" className="wordmark">
          ลานรถ
          {settings.shopName && <small>{settings.shopName}</small>}
        </a>
        {memberships.length > 1 && (
          <select className="shop-switch" aria-label="สลับเต็นท์" value={shopId} onChange={(e) => void switchShop(e.target.value)}>
            {memberships.map((m) => (
              <option key={m.shopId} value={m.shopId}>
                {m.shopName || 'เต็นท์ไม่มีชื่อ'}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-primary rail-new" onClick={() => go('/new')}>
          <Icon name="plus" /> ลงรถคันใหม่
        </button>
        <nav aria-label="เมนูหลัก">
          {NAV.map((n) => (
            <a key={n.key} href={n.href} aria-current={isActive(route, n.key) ? 'page' : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.key === 'cars' && <em>{inStock}</em>}
              {n.key === 'settings' && myInvites.length > 0 && <em className="dot">{myInvites.length}</em>}
            </a>
          ))}
        </nav>
        <div className="rail-foot">
          <SyncBadge />
          <span className="rail-user" title={user.email ?? ''}>
            {user.email}
          </span>
          <button type="button" className="link" onClick={() => void signOut()}>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="mobilebar">
          {memberships.length > 1 ? (
            <select aria-label="สลับเต็นท์" value={shopId} onChange={(e) => void switchShop(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.shopId} value={m.shopId}>
                  {m.shopName || 'เต็นท์ไม่มีชื่อ'}
                </option>
              ))}
            </select>
          ) : (
            <span className="mobilebar-shop">{settings.shopName || 'ลานรถ'}</span>
          )}
          <SyncBadge />
        </div>
        <ErrorBar />
        {page}
      </main>

      <nav className="tabbar" aria-label="เมนูหลัก">
        {NAV.slice(0, 2).map((n) => (
          <a key={n.key} href={n.href} aria-current={isActive(route, n.key) ? 'page' : undefined}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </a>
        ))}
        <a href="#/new" className="tab-new" aria-label="ลงรถคันใหม่">
          <Icon name="plus" size={22} />
        </a>
        {NAV.slice(2).map((n) => (
          <a key={n.key} href={n.href} aria-current={isActive(route, n.key) ? 'page' : undefined}>
            <Icon name={n.icon} size={20} />
            <span>{n.key === 'appraise' ? 'ประเมิน' : n.key === 'settings' ? 'ตั้งค่า/ทีม' : n.label}</span>
          </a>
        ))}
      </nav>
      <Toaster />
    </div>
  )
}
