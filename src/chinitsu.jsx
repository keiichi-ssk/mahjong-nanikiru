import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import ChinitsuDrill from './components/ChinitsuDrill.jsx'
import FeedbackWidget from './components/FeedbackWidget.jsx'

// 認証不要の単独公開ページ。Supabase（lib/supabase.js）を一切 import しないこと。
// （FeedbackWidget も fetch で /api/feedback を呼ぶだけで Supabase 非依存）
// ログイン導線は持たず、本体（問題集）へのリンクのみ置く
// ご意見・ご要望はトップと同じくヘッダー右上（2026-11-04 にフッターから移した）。
// フッターの説明テキスト（.chinitsu-about）は chinitsu.html の静的HTML（JSを実行しないクローラー向け）
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <header className="app-header">
      {/* このページの主題を検索エンジンに伝えるため h1 にする（本体の App.jsx は span のまま） */}
      <h1 className="app-header-title">メンチン何切る</h1>
      <div className="app-header-actions">
        <FeedbackWidget source="chinitsu" variant="header" />
        {/* ご意見・ご要望のアイコンと並ぶとスマホで h1 が省略されるため、共有ページと同じ短い文言にしている */}
        <a className="app-header-cta" href="/">座学する麻雀へ</a>
      </div>
    </header>
    <ChinitsuDrill />
  </StrictMode>,
)
