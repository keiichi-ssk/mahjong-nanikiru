import { useEffect, useState } from 'react'
import ProblemView from '../components/ProblemView'
import { decodeProblemParam } from '../utils/problemShare'
import { SITE_URL } from '../config/site'

// 共有された1問を表示するページ（認証不要・DB非依存）。
//
// 問題の中身は URL の ?p= に丸ごと入っている（utils/problemShare.js）。
// Supabase は引かないので、リンクを受け取った人はログインせずそのまま解ける。
//
// ★ ?p= は他人が書き換えられる文字列なので、decodeProblemParam が構造を検証して
//   壊れていれば null を返す。ここではその null を「読み込めませんでした」の画面に落とす。
//
// ★ デコードは非同期（DecompressionStream を使うため）。
//   その間 status は 'loading' で、静的HTML側のスピナーから引き継いだ見た目を出す。

// URL から共有パラメータを取り出す。マウント前に決まっている値なので初期 state に使う
const readParam = () => new URLSearchParams(window.location.search).get('p')

export default function ShareApp() {
  // status: 'loading' | 'ready' | 'invalid'
  // ★ 「?p= が無い」は URL を見た時点で分かるので初期 state で決める。
  //   effect の中で同期的に setState すると cascading render になる（lint も止める）
  const [{ status, problem }, setResult] = useState(() => ({
    status: readParam() ? 'loading' : 'invalid',
    problem: null,
  }))

  useEffect(() => {
    const param = readParam()
    if (!param) return undefined   // 初期 state で invalid にしてある
    let cancelled = false
    // デコードは非同期（DecompressionStream）なので、ここでの setState は同期実行にならない
    decodeProblemParam(param).then(p => {
      if (!cancelled) {
        setResult(p ? { status: 'ready', problem: p } : { status: 'invalid', problem: null })
      }
    })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <header className="app-header">
        <h1 className="app-header-title">共有された何切る</h1>
        <a className="app-header-cta" href="/">座学する麻雀へ</a>
      </header>

      {status === 'loading' && (
        <div className="share-loading">
          <div className="boot-spinner" />
          <div>読み込んでいます…</div>
        </div>
      )}

      {status === 'invalid' && (
        <div className="share-invalid">
          <p className="share-invalid-title">問題を読み込めませんでした</p>
          <p className="share-invalid-desc">
            リンクが途中で切れているか、古い形式の可能性があります。
            共有元の方にもう一度リンクを送ってもらってください。
          </p>
          <a className="share-cta" href={`${SITE_URL}/chinitsu.html`}>
            メンチン何切るドリルを試す
          </a>
        </div>
      )}

      {status === 'ready' && (
        <>
          {problem.title && <p className="share-title">{problem.title}</p>}
          {/* ラウンドの文脈が無いので standalone。正誤は記録しない（DBに問題行が無い） */}
          <ProblemView standalone problem={problem} index={0} total={1} />
          <footer className="share-footer">
            <p className="share-footer-lead">この問題は、誰かが作って共有したものです。</p>
            <a className="share-cta" href="/">自分でも問題を作ってみる</a>
          </footer>
        </>
      )}
    </>
  )
}
