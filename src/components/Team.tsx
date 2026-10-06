import { useState, type FormEvent } from 'react'
import {
  acceptInvite,
  cancelInvite,
  createShop,
  declineInvite,
  inviteMember,
  removeMember,
  setMemberRole,
  setMyName,
  switchShop,
  useStore,
} from '../lib/store'
import { ROLE_LABEL, type Role } from '../lib/types'
import { Icon, Modal, Segmented, toast } from './ui'

function useAction() {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

export function TeamSection() {
  const user = useStore((s) => s.user)
  const members = useStore((s) => s.members)
  const invites = useStore((s) => s.invites)
  const role = useStore((s) => s.role)
  const owner = role === 'owner'
  const me = members.find((m) => m.userId === user?.id)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('staff')
  const [myName, setMyNameText] = useState(me?.name ?? '')
  const [confirm, setConfirm] = useState<null | { userId: string; label: string; self: boolean }>(null)
  const { busy, run } = useAction()

  function invite(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await inviteMember(email, inviteRole)
      setEmail('')
    }, `เชิญ ${email.trim()} แล้ว`)
  }

  return (
    <fieldset className="block">
      <legend>ทีมงาน</legend>

      <ul className="members">
        {members.map((m) => {
          const self = m.userId === user?.id
          return (
            <li key={m.userId}>
              <div className="member-id">
                <b>
                  {m.name || m.email.split('@')[0]}
                  {self && <span className="muted"> (คุณ)</span>}
                </b>
                <small className="muted">{m.email}</small>
              </div>
              {owner && !self ? (
                <select
                  aria-label={`บทบาทของ ${m.email}`}
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => void run(() => setMemberRole(m.userId, e.target.value as Role), 'เปลี่ยนบทบาทแล้ว')}
                >
                  <option value="staff">{ROLE_LABEL.staff}</option>
                  <option value="owner">{ROLE_LABEL.owner}</option>
                </select>
              ) : (
                <span className={'role role-' + m.role}>{ROLE_LABEL[m.role]}</span>
              )}
              {((owner && !self) || (self && !owner)) && (
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={self ? 'ออกจากเต็นท์' : `เอา ${m.email} ออกจากทีม`}
                  onClick={() => setConfirm({ userId: m.userId, label: m.name || m.email, self })}
                >
                  <Icon name="x" size={15} />
                </button>
              )}
            </li>
          )
        })}
        {invites.map((i) => (
          <li key={i.id} className="member-pending">
            <div className="member-id">
              <b>{i.email}</b>
              <small className="muted">รอสมัคร/เข้าสู่ระบบด้วยอีเมลนี้</small>
            </div>
            <span className="role">{ROLE_LABEL[i.role]} · รอตอบรับ</span>
            {owner && (
              <button type="button" className="icon-btn sm" aria-label={`ยกเลิกคำเชิญ ${i.email}`} onClick={() => void run(() => cancelInvite(i.id), 'ยกเลิกคำเชิญแล้ว')}>
                <Icon name="x" size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {owner ? (
        <form className="invite-form" onSubmit={invite}>
          <input type="email" required placeholder="อีเมลพนักงาน" aria-label="อีเมลพนักงาน" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Segmented
            ariaLabel="บทบาท"
            value={inviteRole}
            onChange={setInviteRole}
            options={[
              { value: 'staff', label: ROLE_LABEL.staff },
              { value: 'owner', label: ROLE_LABEL.owner },
            ]}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            เชิญเข้าทีม
          </button>
        </form>
      ) : null}

      <details className="roles-help">
        <summary>เจ้าของกับพนักงานทำอะไรได้บ้าง</summary>
        <table className="ledger">
          <tbody>
            <tr>
              <td>ลงรถ แก้ข้อมูลรถ ลงค่าใช้จ่าย ตั้งราคา จอง/ขาย พิมพ์ป้าย</td>
              <td>ทุกคน</td>
            </tr>
            <tr>
              <td>ลบค่าใช้จ่าย</td>
              <td>คนที่ลงรายการนั้น / เจ้าของ</td>
            </tr>
            <tr>
              <td>ลบรถ, แก้การตั้งค่าเต็นท์, เชิญ/เอาสมาชิกออก</td>
              <td>เจ้าของ</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          วิธีเชิญ: ใส่อีเมลพนักงาน แล้วให้พนักงานเปิดแอปนี้ สมัคร/เข้าสู่ระบบด้วยอีเมลเดียวกัน จะเห็นคำเชิญให้กดเข้าร่วม
        </p>
      </details>

      <label className="label-sm" htmlFor="my-name">
        ชื่อของคุณที่เพื่อนในทีมเห็น
      </label>
      <form
        className="inline-form my-name"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => setMyName(myName), 'บันทึกชื่อแล้ว')
        }}
      >
        <input id="my-name" placeholder="ชื่อที่แสดงในทีม เช่น เซลล์บอย" value={myName} onChange={(e) => setMyNameText(e.target.value)} />
        <button type="submit" className="btn" disabled={busy || myName === (me?.name ?? '')}>
          บันทึกชื่อ
        </button>
      </form>

      {confirm && (
        <Modal title={confirm.self ? 'ออกจากเต็นท์นี้?' : 'เอาออกจากทีม?'} onClose={() => setConfirm(null)}>
          <p>{confirm.self ? 'คุณจะไม่เห็นข้อมูลรถของเต็นท์นี้อีก จนกว่าเจ้าของจะเชิญใหม่' : `${confirm.label} จะไม่เห็นข้อมูลรถของเต็นท์นี้อีก ข้อมูลที่เขาลงไว้ยังอยู่ครบ`}</p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                const c = confirm
                setConfirm(null)
                void run(() => removeMember(c.userId), c.self ? 'ออกจากเต็นท์แล้ว' : 'เอาออกจากทีมแล้ว')
              }}
            >
              {confirm.self ? 'ออกจากเต็นท์' : 'เอาออก'}
            </button>
          </div>
        </Modal>
      )}
    </fieldset>
  )
}

/** สลับเต็นท์ / รับคำเชิญ / เปิดเต็นท์ใหม่ */
export function ShopsSection() {
  const memberships = useStore((s) => s.memberships)
  const shopId = useStore((s) => s.shopId)
  const myInvites = useStore((s) => s.myInvites)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const { busy, run } = useAction()

  return (
    <fieldset className="block">
      <legend>เต็นท์ของฉัน</legend>
      {myInvites.length > 0 && (
        <ul className="invite-list">
          {myInvites.map((i) => (
            <li key={i.id}>
              <div>
                <b>{i.shopName || 'เต็นท์ไม่มีชื่อ'}</b>
                <small className="muted">ชวนคุณเป็น{ROLE_LABEL[i.role]}</small>
              </div>
              <button type="button" className="btn" disabled={busy} onClick={() => void run(() => declineInvite(i.id))}>
                ไม่รับ
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => acceptInvite(i.id), 'เข้าร่วมแล้ว')}>
                เข้าร่วม
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="shop-list">
        {memberships.map((m) => (
          <li key={m.shopId}>
            <button type="button" className={'shop-item' + (m.shopId === shopId ? ' on' : '')} onClick={() => void run(() => switchShop(m.shopId))} disabled={busy}>
              <span>{m.shopName || 'เต็นท์ไม่มีชื่อ'}</span>
              <small className="muted">{ROLE_LABEL[m.role]}</small>
              {m.shopId === shopId && <Icon name="check" size={16} />}
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await createShop(name)
              setName('')
              setOpen(false)
            }, 'เปิดเต็นท์ใหม่แล้ว')
          }}
        >
          <input autoFocus required aria-label="ชื่อเต็นท์ใหม่" placeholder="ชื่อเต็นท์ใหม่" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={busy}>
            สร้าง
          </button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          + เปิดเต็นท์ใหม่ (สาขาอื่น)
        </button>
      )}
    </fieldset>
  )
}
