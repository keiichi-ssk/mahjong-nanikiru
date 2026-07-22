import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import ChinitsuDrill from './components/ChinitsuDrill.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'

// 認証不要の単独公開ページ。Supabase（lib/supabase.js）を一切 import しないこと。
// （FeedbackWidget も fetch で /api/feedback を呼ぶだけで Supabase 非依存）
// ログイン導線は持たず、本体（問題集）へのリンクのみ置く
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <header className="app-header">
      <span className="app-header-title">メンチン何切るドリル</span>
      <a className="app-header-cta" href="/">問題集「座学する麻雀」へ</a>
    </header>
    <ChinitsuDrill />
    <footer className="app-footer">
      <FeedbackWidget source="chinitsu" />
    </footer>
  </StrictMode>,
)
