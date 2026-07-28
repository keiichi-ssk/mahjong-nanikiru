import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MyProblemsApp from './myproblems/MyProblemsApp'
import './index.css'
// 盤面（BoardView）と問題エディタ（ProblemEditor）のスタイルは admin.css が持っている。
// この画面はそれらを共有して使うため、本体（App.css）ではなく admin.css を読む
import './admin/admin.css'
// この画面だけで使うスタイル（admin.css は AdminApp 用なので混ぜない）
import './myproblems/myproblems.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MyProblemsApp />
  </StrictMode>
)
