// ลานรถ service worker: เปิดแอปได้เร็วและเปิดได้แม้สัญญาณไม่ดี
// ข้อมูลรถมาจาก Supabase เสมอ (ไม่แคช) เพื่อให้ทุกคนในทีมเห็นข้อมูลล่าสุด
const CACHE = 'lanrot-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // หน้าแอป: เอาของใหม่จากเน็ตก่อน ถ้าไม่มีเน็ตใช้ของที่แคชไว้
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // ไฟล์ JS/CSS ที่มี hash ในชื่อ และฟอนต์: ใช้จากแคชได้เลย
  const sameOrigin = url.origin === self.location.origin
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if ((sameOrigin && (url.pathname.includes('/assets/') || /\.(png|webmanifest)$/.test(url.pathname))) || isFont) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
