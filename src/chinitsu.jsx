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
      {/* このページの主題を検索エンジンに伝えるため h1 にする（本体の App.jsx は span のまま） */}
      <h1 className="app-header-title">メンチン何切るドリル</h1>
      <a className="app-header-cta" href="/">問題集「座学する麻雀」へ</a>
    </header>
    <ChinitsuDrill />
  </StrictMode>,
)

// フッター（説明テキスト＋ご意見・ご要望）は chinitsu.html 側の静的HTMLが器になっている。
// 説明テキスト（.chinitsu-about）はJSを実行しないクローラーにも読ませる必要があるため静的HTMLのままにし、
// その下に来るご意見・ご要望だけをここで別マウントする（#root の中に入れると説明より上に出てしまうため）。
// 本体（App.jsx）側は同じ並びを ChinitsuAbout コンポーネントで再現している。
createRoot(document.getElementById('feedback-root')).render(
  <StrictMode>
    <FeedbackWidget source="chinitsu" />
  </StrictMode>,
)
