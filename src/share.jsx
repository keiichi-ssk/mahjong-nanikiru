import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import ShareApp from './share/ShareApp.jsx'

// 共有された1問を表示する単独ページ（認証不要）。
// 問題の中身は URL の ?p= に入っていて DB を引かないので、リンクを受け取った人は
// ログインせずにそのまま解ける（メンチンドリルの ?q= と同じ考え方）。
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ShareApp />
  </StrictMode>,
)
