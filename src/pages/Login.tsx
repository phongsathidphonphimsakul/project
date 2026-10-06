import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'reset'

const MSG: Record<string, string> = {
  'Invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'Email not confirmed': 'ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ในอีเมลก่อน',
  'User already registered': 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบ',
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
        if (error) throw error
        if (!data.session) setInfo('สมัครแล้ว — เช็กอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
        if (error) throw error
        setInfo('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว')
      }
    } catch (err) {
      const m = (err as Error).message
      setError(MSG[m] ?? m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-side">
        <div className="wordmark wordmark-lg">ลานรถ</div>
        <p>
          จดต้นทุนรถทุกคัน ตั้งราคาขายจากกำไรที่ต้องการ
          <br />
          รู้ว่าเงินจมอยู่กับคันไหน และคันไหนจอดนานเกินไป
        </p>
        <dl className="auth-sample" aria-hidden="true">
          <div>
            <dt>ทุนรวม</dt>
            <dd>312,500</dd>
          </div>
          <div>
            <dt>ตั้งขาย</dt>
            <dd className="sticker">369,000</dd>
          </div>
          <div>
            <dt>กำไร</dt>
            <dd className="pos">+56,500</dd>
          </div>
        </dl>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <h1>{mode === 'signin' ? 'เข้าสู่ระบบ' : mode === 'signup' ? 'สมัครใช้งาน' : 'ลืมรหัสผ่าน'}</h1>
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'reset' && (
          <div className="field">
            <label htmlFor="pw">รหัสผ่าน</label>
            <input
              id="pw"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'รอสักครู่…' : mode === 'signin' ? 'เข้าสู่ระบบ' : mode === 'signup' ? 'สมัคร' : 'ส่งลิงก์'}
        </button>
        <div className="auth-switch">
          {mode !== 'signin' && (
            <button type="button" className="link" onClick={() => setMode('signin')}>
              มีบัญชีแล้ว? เข้าสู่ระบบ
            </button>
          )}
          {mode === 'signin' && (
            <>
              <button type="button" className="link" onClick={() => setMode('signup')}>
                สมัครใช้งาน
              </button>
              <button type="button" className="link" onClick={() => setMode('reset')}>
                ลืมรหัสผ่าน
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
