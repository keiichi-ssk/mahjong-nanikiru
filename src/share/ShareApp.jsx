import { useEffect, useState } from 'react'
import ProblemView from '../components/ProblemView'
import { decodeProblemParam } from '../utils/problemShare'
import { SITE_URL } from '../config/site'
import { track, EVENTS } from '../utils/analytics'

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

// URL から共有パラメータを取り出す。マウント前に決まっている値なので初期 state に使う。
//
// ★ 共有リンクには2種類ある（**どちらも生かし続けること**）:
//   t= … 保存済みの問題。DBから引くので、作者が編集すると**このURLのまま最新が見える**
//   p= … 未保存の問題。URLに中身が入っている（＝編集しても反映されない）。過去に配ったリンクもこれ
const readParams = () => {
  const q = new URLSearchParams(window.location.search)
  return { token: q.get('t'), packed: q.get('p') }
}

// t= は API 経由で取る。ブラウザから直接 Supabase を引かないのは、
// このページに supabase-js（201KB）を持ち込まないためと、
// 「トークン一致の1行だけ」という制御が RLS では安全に書けないため（api/_lib/sharedProblem.js 参照）
async function loadProblem({ token, packed }) {
  if (token) {
    try {
      const res = await fetch(`/api/shared-problem?t=${encodeURIComponent(token)}`)
      if (!res.ok) return null
      const json = await res.json()
      return json?.problem ?? null
    } catch {
      return null   // 通信断など。「読み込めませんでした」の画面に落とす
    }
  }
  return decodeProblemParam(packed)
}

export default function ShareApp() {
  // status: 'loading' | 'ready' | 'invalid'
  // ★ 「?p= が無い」は URL を見た時点で分かるので初期 state で決める。
  //   effect の中で同期的に setState すると cascading render になる（lint も止める）
  const [{ status, problem }, setResult] = useState(() => {
    const { token, packed } = readParams()
    return { status: token || packed ? 'loading' : 'invalid', problem: null }
  })

  useEffect(() => {
    const params = readParams()
    if (!params.token && !params.packed) return undefined   // 初期 state で invalid にしてある
    let cancelled = false
    // 取得は非同期（API呼び出し／DecompressionStream）なので、ここでの setState は同期実行にならない
    loadProblem(params).then(p => {
      if (!cancelled) {
        // 共有リンクが実際に開かれた回数（＝拡散の効き具合）。壊れたリンクも ok:false で数え、
        // 「共有したのに解けなかった」ケースが起きていないかを見られるようにする
        track(EVENTS.sharedProblemOpened, { ok: !!p, via: params.token ? 'token' : 'param' })
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
          {/* ★ タイトルはここに出さないこと（2026-07-30）。
              牌譜から作った問題のタイトルは defaultProblemTitle() が
              「東4局 3本場 9巡目」を自動で入れるので、盤面中央と同じ内容が
              盤面の上にもう一度並ぶ。タイトル自体は my問題集の一覧で
              問題を見分けるのに要るため、生成はやめずに表示だけ落としてある */}
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
