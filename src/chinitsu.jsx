import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import './App.css'
import ChinitsuTrainer from './components/ChinitsuTrainer.jsx'

inject()

// 認証不要の単独公開ページ。Supabase（lib/supabase.js）を一切 import しないこと。
// ログイン導線は持たず、本体（問題集）へのリンクのみ置く
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <header className="app-header">
      <span className="app-header-title">清一色 何切る道場</span>
      <a className="app-header-cta" href="/">問題集「座学する麻雀」へ</a>
    </header>
    <ChinitsuTrainer />
  </StrictMode>,
)
