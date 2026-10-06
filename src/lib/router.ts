import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'cars' }
  | { name: 'new' }
  | { name: 'car'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'print'; id: string }
  | { name: 'appraise' }
  | { name: 'settings' }

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  switch (parts[0]) {
    case 'cars':
      return { name: 'cars' }
    case 'new':
      return { name: 'new' }
    case 'car':
      if (parts[1] && parts[2] === 'edit') return { name: 'edit', id: parts[1] }
      if (parts[1] && parts[2] === 'print') return { name: 'print', id: parts[1] }
      if (parts[1]) return { name: 'car', id: parts[1] }
      return { name: 'cars' }
    case 'appraise':
      return { name: 'appraise' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'dashboard' }
  }
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    () => window.location.hash,
  )
  return parse(hash)
}

export function go(path: string) {
  window.location.hash = path
  window.scrollTo(0, 0)
}
