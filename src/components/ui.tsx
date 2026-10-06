import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { baht, parseNum } from '../lib/format'

/** ช่องกรอกเงิน: พิมพ์ 350000 / 350,000 / 350k ได้ แสดงผลมีคอมมา */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  suffix = '฿',
  allowEmpty,
  id,
  ariaLabel,
}: {
  value: number | null
  onChange: (n: number | null) => void
  placeholder?: string
  autoFocus?: boolean
  suffix?: string
  allowEmpty?: boolean
  id?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(value == null || (value === 0 && allowEmpty) ? '' : baht(value))
  const focused = useRef(false)

  useEffect(() => {
    // ล้างช่องเสมอเมื่อค่าถูกรีเซ็ต (เช่น หลังกดเพิ่มรายการ) แม้ช่องยังโฟกัสอยู่
    if (value == null) setText('')
    else if (!focused.current) setText(baht(value))
  }, [value])

  return (
    <span className="money">
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder ?? '0'}
        value={text}
        onFocus={(e) => {
          focused.current = true
          e.currentTarget.select()
        }}
        onBlur={() => {
          focused.current = false
          const n = parseNum(text)
          setText(Number.isFinite(n) ? baht(n) : '')
        }}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseNum(e.target.value)
          if (Number.isFinite(n)) onChange(n)
          else if (e.target.value.trim() === '') onChange(allowEmpty ? null : 0)
        }}
      />
      {suffix && <span className="money-suffix">{suffix}</span>}
    </span>
  )
}

export function NumInput({
  value,
  onChange,
  suffix,
  step = 1,
  min,
  max,
  ariaLabel,
  id,
}: {
  value: number
  onChange: (n: number) => void
  suffix?: string
  step?: number
  min?: number
  max?: number
  ariaLabel?: string
  id?: string
}) {
  return (
    <span className="money">
      <input
        id={id}
        aria-label={ariaLabel}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
      {suffix && <span className="money-suffix">{suffix}</span>}
    </span>
  )
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId()
  return (
    <div className={'field' + (wide ? ' field-wide' : '')}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small className="hint">{hint}</small>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal-body">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="ปิด">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  back: 'M15 6l-6 6 6 6',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  calc: 'M6 3h12v18H6zM9 7h6M9 11h1M14 11h1M9 15h1M14 15h1M9 18h1M14 18h1',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  check: 'M5 12l5 5 9-10',
}

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/** ข้อความแจ้งเตือนสั้นๆ มุมล่าง */
let toastFn: ((msg: string) => void) | null = null
export function toast(msg: string) {
  toastFn?.(msg)
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    toastFn = (m) => {
      setMsg(m)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMsg(null), 2600)
    }
    return () => {
      toastFn = null
    }
  }, [])
  return (
    <div className="toast" role="status" aria-live="polite" data-show={msg ? '' : undefined}>
      {msg}
    </div>
  )
}
