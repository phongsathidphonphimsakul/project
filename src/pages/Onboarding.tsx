import { useState, type FormEvent } from 'react'
import { acceptInvite, createShop, declineInvite, signOut, useStore } from '../lib/store'
import { ROLE_LABEL } from '../lib/types'

/** ผู้ใช้ที่ยังไม่อยู่ในเต็นท์ไหน: สร้างเต็นท์ใหม่ หรือรับคำเชิญ */
export default function Onboarding() {
  const user = useStore((s) => s.user)
  const invites = useStore((s) => s.myInvites)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run('create', () => createShop(name))
  }

  return (
    <div className="onboard">
      <div className="wordmark wordmark-lg">ลานรถ</div>

      {invites.length > 0 && (
        <section className="onboard-block">
          <h1>มีคนชวนคุณเข้าทีม</h1>
          <ul className="invite-list">
            {invites.map((i) => (
              <li key={i.id}>
                <div>
                  <b>{i.shopName || 'เต็นท์ไม่มีชื่อ'}</b>
                  <small className="muted">ในฐานะ{ROLE_LABEL[i.role]}</small>
                </div>
                <button type="button" className="btn" disabled={!!busy} onClick={() => run(i.id + 'x', () => declineInvite(i.id))}>
                  ไม่รับ
                </button>
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run(i.id, () => acceptInvite(i.id))}>
                  {busy === i.id ? 'กำลังเข้าร่วม…' : 'เข้าร่วม'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="onboard-block" onSubmit={submit}>
        <h1>{invites.length ? 'หรือเปิดเต็นท์ของตัวเอง' : 'ตั้งชื่อเต็นท์ของคุณ'}</h1>
        <p className="muted">
          คุณจะเป็นเจ้าของเต็นท์ แล้วชวนพนักงานเข้ามาใช้ร่วมกันได้ที่หน้าตั้งค่า
          <br />
          ถ้าเป็นพนักงาน ให้เจ้าของเต็นท์เชิญอีเมล <b>{user?.email}</b> แล้วกลับมาหน้านี้
        </p>
        <div className="inline-form">
          <input aria-label="ชื่อเต็นท์" placeholder="เช่น ต.ยานยนต์ คาร์เซ็นเตอร์" value={name} onChange={(e) => setName(e.target.value)} required />
          <button type="submit" className="btn btn-primary" disabled={!!busy}>
            {busy === 'create' ? 'กำลังสร้าง…' : 'สร้างเต็นท์'}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      <button type="button" className="link" onClick={() => void signOut()}>
        ออกจากระบบ ({user?.email})
      </button>
    </div>
  )
}
