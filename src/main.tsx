import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isConfigured } from './lib/supabase'
import { initAuth } from './lib/store'
import './styles.css'

if (isConfigured) initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
