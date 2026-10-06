/** แสดงเมื่อยังไม่ได้ใส่ค่า Supabase ใน .env.local */
export default function Setup() {
  return (
    <div className="setup">
      <div className="wordmark wordmark-lg">ลานรถ</div>
      <h1>ยังไม่ได้เชื่อมต่อ Supabase</h1>
      <ol>
        <li>
          สร้างโปรเจกต์ที่ <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>
        </li>
        <li>
          เปิด <b>SQL Editor</b> แล้วรันไฟล์ <code>supabase/migrations/20261006000000_init.sql</code>
        </li>
        <li>
          คัดลอก <code>.env.example</code> เป็น <code>.env.local</code> แล้วใส่ <code>VITE_SUPABASE_URL</code> และ{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> จาก Project Settings → API
        </li>
        <li>
          รัน <code>npm run dev</code> ใหม่
        </li>
      </ol>
    </div>
  )
}
