import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import ProblemEditor from '../admin/ProblemEditor'
import { toUserDb, fromUserDb, makeNewUserProblem } from '../utils/userProblemMapper'
import { PROBLEM_TYPE_LABELS } from '../utils/problemConstants'
import { normalizeProblemType } from '../utils/judgeUtils'
import PaifuImport from './PaifuImport'
import EditorGuide from './EditorGuide'
import { snapshotToProblem } from '../utils/importBoard'
import {
  validatePaifu, listRounds, listSteps, snapshotAt, filterSteps, defaultProblemTitle,
} from '../utils/tenhouPaifu'

// 自作問題集（my問題集）の作成画面。
// 計画: docs/user-problems-plan.md
//
// ゲートは「ログインしているか」だけ（2026-07-28 一般公開）。
// allowed_users（公式問題の閲覧許可リスト）にも is_admin にも依存しない。
// 実効防御は user_problems / user_categories の RLS（auth.uid() = user_id）で、
// 作れる件数・文字数の上限も DB 側で強制する（UIで止めても anon キーで直接叩けるため）。

// サイドバーで「未分類」を選んでいる状態。null（＝カテゴリ未選択）と区別する必要があるため
// 専用の値を使う（category_id が null の問題にもアクセスできるようにするため）
const UNCATEGORIZED = '__uncategorized__'

// カテゴリと問題をまとめて取得する。
// setState を持たない純粋な取得関数にしてあるのは、effect から同期的に呼んでも
// 「effect 内の setState」（cascading render）の lint に触れないようにするため。
//
// RLS は弾いたときエラーではなく「0件の正常応答」を返すため、
// エラーの有無ではなく件数で成否を判断すること（CLAUDE.md「Supabase の知見」）
async function fetchAll() {
  const [cats, probs] = await Promise.all([
    supabase.from('user_categories').select('*').order('sort_order'),
    // 一覧・出題順ともに表示番号（#1, #2 …）に揃える。
    // sort_order（カテゴリ内の手動並べ替え用）は将来のために列だけ残してある
    supabase.from('user_problems').select('*').order('display_no'),
  ])
  const error = cats.error || probs.error
  if (error) return { error: error.message }
  return {
    categories: cats.data ?? [],
    problems: (probs.data ?? []).map(fromUserDb),
  }
}

// 一覧に出す1行ぶんの要約。ラベルは problemConstants に集約してある
// （管理画面のセレクタと文言がズレないようにするため）
function problemSummary(p) {
  const type = normalizeProblemType(p.problemType)
  return PROBLEM_TYPE_LABELS[type] ?? type
}

// 1問ぶんの編集ペイン。
// 番号・タイトル・カテゴリは**左の一覧から**変更するので、ここでは持たない
// （同じ設定の入口が2つあると、どちらが有効か分からなくなるため）。
// 保存時は問題が元々持っている値をそのまま引き継ぐ。
function ProblemPane({ problem, prevProblem, hasNext, onSave, onSaveAndNext, saveStatus }) {
  // buildSaveData は {...problem} を土台にするので title / categoryId は自動で残る
  return (
    <ProblemEditor
      problem={problem}
      prevProblem={prevProblem}
      hasNext={hasNext}
      hideImage
      hideReviewed
      hideDelete
      hideDisabled
      headerLead={<h3 className="editor-title">#{problem.displayNo ?? '—'}</h3>}
      paletteAside={<EditorGuide mode="manual" />}
      saveStatus={saveStatus}
      onSave={onSave}
      onSaveAndNext={onSaveAndNext}
      onDelete={() => {}}
    />
  )
}

export default function MyProblemsApp() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [categories, setCategories] = useState([])
  const [problems, setProblems]     = useState([])
  const [ready, setReady]           = useState(false)
  const [loadError, setLoadError]   = useState(null)

  const [selectedCatId, setSelectedCatId]   = useState(null)
  const [selectedProbId, setSelectedProbId] = useState(null)
  // メイン領域の表示。'editor' = 保存済みの問題を編集 / 'paifu' = 牌譜から局面を切り出す（未保存）
  const [view, setView]                     = useState('editor')
  // 読み込んだ牌譜と、いま見ている局面。
  // ★ 牌譜から作った問題は「保存」で初めて user_problems に入る（作りかけが溜まらないようにするため）
  const [paifu, setPaifu]               = useState(null)
  const [paifuFile, setPaifuFile]       = useState('')
  const [paifuError, setPaifuError]     = useState('')
  // stepIndex は listSteps のインデックス（局面）。filter は画面での絞り込み
  const [draft, setDraft]               = useState({ roundIndex: 0, seat: 0, stepIndex: 0, filter: 'self' })
  const [draftCategoryId, setDraftCategoryId] = useState(null)
  // 保存済みの局面（同じ局面を続けて保存してしまわないよう画面で知らせる）
  const [savedKeys, setSavedKeys]       = useState(() => new Set())
  const [newName, setNewName]               = useState('')
  const [editingId, setEditingId]           = useState(null)
  const [editingName, setEditingName]       = useState('')
  // 問題一覧での番号・タイトルの直接編集
  const [editingProbId, setEditingProbId]   = useState(null)
  const [editProbTitle, setEditProbTitle]   = useState('')
  const [editProbNo, setEditProbNo]         = useState('')
  const [editProbCat, setEditProbCat]       = useState('')
  const [status, setStatus]                 = useState('')
  // 保存ボタンの隣に出す状態表示。{ text, error } | null
  // 成功は数秒で自動的に消す（消えずに残っていると、次の保存で変化が無く保存されたか分からないため）
  const [editorStatus, setEditorStatus]     = useState(null)
  const editorStatusTimer                   = useRef(null)
  const paifuFileRef                        = useRef(null)

  useEffect(() => () => clearTimeout(editorStatusTimer.current), [])

  function showSaved(text) {
    clearTimeout(editorStatusTimer.current)
    setEditorStatus({ text, error: false })
    editorStatusTimer.current = setTimeout(() => setEditorStatus(null), 2500)
  }

  // エラーは自動で消さない（読み逃すため）
  function showSaveError(text) {
    clearTimeout(editorStatusTimer.current)
    setEditorStatus({ text, error: true })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // my問題集は「ログイン済みなら誰でも使える」（2026-07-28 一般公開）。
  // allowed_users（公式問題の閲覧許可）とも is_admin とも無関係で、
  // user_problems / user_categories の RLS は auth.uid() だけを見ている。
  // 作れる件数の上限は DB 側（RLS の with check）で強制する
  const userId  = session?.user?.id ?? null

  // ===== 牌譜のドラフト（描画時に導出する） =====
  // 選べる局面は「局 × 席 × 絞り込み」で変わるので、state はそのままにして
  // 描画時に有効な局面へ寄せる（effect で setState すると cascading render になるため）
  const paifuRounds = useMemo(() => (paifu ? listRounds(paifu) : []), [paifu])
  const allSteps    = useMemo(
    () => (paifu ? listSteps(paifu, draft.roundIndex) : []),
    [paifu, draft.roundIndex],
  )
  const visibleSteps = useMemo(
    () => filterSteps(allSteps, draft.filter, draft.seat),
    [allSteps, draft.filter, draft.seat],
  )
  // 選択中の局面が絞り込みから外れていたら、その中の先頭に寄せる
  const currentStep = visibleSteps.find(s => s.index === draft.stepIndex) ?? visibleSteps[0] ?? null
  const stepIndex   = currentStep?.index ?? -1
  // 局面が変わったらエディタを作り直すためのキー（保存済みの記録にも使う）
  const draftKey = `${draft.roundIndex}-${draft.seat}-${stepIndex}`

  const paifuResult = useMemo(
    () => (paifu && stepIndex >= 0
      ? snapshotAt(paifu, draft.roundIndex, stepIndex, { seat: draft.seat })
      : null),
    [paifu, draft.roundIndex, draft.seat, stepIndex],
  )

  // 他家の手牌の実際の枚数（ツモ直後なら14枚）。盤面の裏向きの枚数に使う。
  // problem には保存されない表示専用の情報
  const concealedCounts = useMemo(() => {
    const seats = paifuResult?.snapshot?.seats
    if (!seats) return null
    return Object.fromEntries(
      Object.entries(seats).map(([wind, s]) => [wind, s.hand.length])
    )
  }, [paifuResult])

  // 盤面だけが埋まった未保存の問題。正解・解説はエディタで人が設定する
  // （牌譜に入っているのは実際に切った牌であって正解ではない）
  const draftProblem = useMemo(() => {
    if (!paifuResult) return null
    const board = snapshotToProblem(paifuResult.snapshot)
    return {
      ...makeNewUserProblem(),
      ...board,
      title: defaultProblemTitle(paifu, draft.roundIndex, board.junme),
    }
  }, [paifuResult, paifu, draft.roundIndex])

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    fetchAll().then(r => {
      if (cancelled) return
      if (r.error) { setLoadError(r.error); return }
      setLoadError(null)
      setCategories(r.categories)
      setProblems(r.problems)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [session])

  // 操作後の再取得。イベントハンドラからだけ呼ぶ（effect からは上の Promise チェーンを使う）
  async function reload() {
    const r = await fetchAll()
    if (r.error) { setLoadError(r.error); return }
    setLoadError(null)
    setCategories(r.categories)
    setProblems(r.problems)
    setReady(true)
  }

  // ===== カテゴリ操作 =====

  async function addCategory() {
    const name = newName.trim()
    if (!name || !userId) return
    // 並び順は末尾。既存が空なら 0
    const nextOrder = categories.length > 0
      ? Math.max(...categories.map(c => c.sort_order ?? 0)) + 1
      : 0
    const { data, error } = await supabase
      .from('user_categories')
      .insert({ user_id: userId, name, sort_order: nextOrder })
      .select('id')
    if (error) { setStatus(`追加に失敗しました: ${error.message}`); return }
    // RLS で弾かれると 0 行のまま成功扱いになるため、実際に入ったかを確認する
    if (!data || data.length === 0) { setStatus('追加できませんでした（権限の可能性）'); return }
    setNewName('')
    setStatus('追加しました ✓')
    await reload()
  }

  async function renameCategory(id) {
    const name = editingName.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('user_categories')
      .update({ name })
      .eq('id', id)
      .select('id')
    if (error) { setStatus(`変更に失敗しました: ${error.message}`); return }
    if (!data || data.length === 0) { setStatus('変更できませんでした（権限の可能性）'); return }
    setEditingId(null)
    setEditingName('')
    setStatus('変更しました ✓')
    await reload()
  }

  // ↑↓ での並べ替え。
  // useDragReorder は横並び前提（clientX だけで挿入位置を決める）なので縦のリストには使えない。
  // 入れ替え後は sort_order を index で振り直す（初期値が重複していても壊れないように）
  async function moveCategory(index, dir) {
    const to = index + dir
    if (to < 0 || to >= categories.length) return
    const next = [...categories]
    ;[next[index], next[to]] = [next[to], next[index]]
    setCategories(next)   // 先に見た目を動かす
    const results = await Promise.all(
      next.map((c, i) => supabase.from('user_categories').update({ sort_order: i }).eq('id', c.id))
    )
    const failed = results.find(r => r.error)
    if (failed) { setStatus(`並べ替えに失敗しました: ${failed.error.message}`); await reload(); return }
    setStatus('並べ替えました ✓')
  }

  async function deleteCategory(cat) {
    const count = problems.filter(p => p.categoryId === cat.id).length
    const message = count > 0
      ? `カテゴリ「${cat.name}」を削除しますか？\n\nこのカテゴリの問題 ${count} 問は削除されず「未分類」になります。`
      : `カテゴリ「${cat.name}」を削除しますか？`
    if (!window.confirm(message)) return
    const { data, error } = await supabase
      .from('user_categories')
      .delete()
      .eq('id', cat.id)
      .select('id')
    if (error) { setStatus(`削除に失敗しました: ${error.message}`); return }
    // RLS では条件に合わない行が「0行削除の成功」として返るため、実削除行数を検証する
    if (!data || data.length === 0) { setStatus('削除できませんでした（権限の可能性）'); return }
    if (selectedCatId === cat.id) setSelectedCatId(null)
    setStatus('削除しました ✓')
    await reload()
  }

  function startEditing(cat) {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  // ===== 問題操作 =====

  // 問題を選ぶと必ず編集画面に戻す（牌譜画面を開いたままだと選んだ問題が見えない）
  function selectProblem(id) {
    setSelectedProbId(id)
    setView('editor')
  }

  async function addProblem() {
    if (!userId || !selectedCatId) return
    const categoryId = selectedCatId === UNCATEGORIZED ? null : selectedCatId
    // user_id は insert のときだけ付ける（toUserDb は含めない）
    const row = { ...toUserDb(makeNewUserProblem(), { categoryId }), user_id: userId }
    const { data, error } = await supabase.from('user_problems').insert(row).select('*')
    if (error) { setStatus(`問題の追加に失敗しました: ${error.message}`); return }
    if (!data || data.length === 0) { setStatus('追加できませんでした（権限の可能性）'); return }
    await reload()
    selectProblem(data[0].id)
    setStatus('問題を追加しました ✓')
  }

  // ===== 牌譜から作る =====

  async function readPaifuFile(file) {
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const check = validatePaifu(json)
      if (!check.ok) { setPaifu(null); setPaifuFile(file.name); setPaifuError(check.reason); return }
      setPaifu(json)
      setPaifuFile(file.name)
      setPaifuError('')
      // 牌譜が変わったら局面と保存済みの記録は最初に戻す
      setDraft({ roundIndex: 0, seat: 0, stepIndex: 0, filter: 'self' })
      setSavedKeys(new Set())
      setDraftCategoryId(selectedCatId === UNCATEGORIZED ? null : selectedCatId)
      setView('paifu')
    } catch {
      setPaifu(null)
      setPaifuFile(file.name)
      setPaifuError('JSONとして読み取れませんでした')
    }
  }

  // 牌譜から切り出した局面を1問として保存する（insert）。
  // 保存後もドラフトは残すので、続けて別の局面を切り出せる
  async function saveDraft(updated) {
    if (!userId) return false
    const row = {
      ...toUserDb(updated, { categoryId: draftCategoryId }),
      user_id: userId,
    }
    const { data, error } = await supabase.from('user_problems').insert(row).select('id')
    if (error) { showSaveError(`保存に失敗: ${error.message}`); return false }
    if (!data || data.length === 0) { showSaveError('保存できませんでした（権限の可能性）'); return false }
    showSaved('保存しました ✓')
    setSavedKeys(prev => new Set(prev).add(draftKey))
    await reload()
    return true
  }

  async function saveProblem(updated) {
    if (!userId) return false
    // 更新では user_id を送らない（行の所有者は変わらないため）
    const row = toUserDb(updated, { categoryId: updated.categoryId ?? null })
    const { data, error } = await supabase
      .from('user_problems')
      .update(row)
      .eq('id', updated.id)
      .select('id')
    if (error) { showSaveError(`保存に失敗: ${error.message}`); return false }
    if (!data || data.length === 0) { showSaveError('保存できませんでした（権限の可能性）'); return false }
    showSaved('保存しました ✓')
    await reload()
    return true
  }

  async function saveProblemAndNext(updated) {
    const list = visibleProblems
    const i = list.findIndex(p => p.id === updated.id)
    const ok = await saveProblem(updated)
    if (!ok) return
    if (i >= 0 && i < list.length - 1) selectProblem(list[i + 1].id)
  }

  function startEditingProb(p) {
    setEditingProbId(p.id)
    setEditProbTitle(p.title ?? '')
    setEditProbNo(String(p.displayNo ?? ''))
    setEditProbCat(p.categoryId ?? '')
  }

  // 一覧から番号・タイトル・カテゴリを直接変更する（エディタ側には同じ設定を置かない）。
  // 番号が既に使われていたら相手と入れ替える（display_no に unique 制約は無いので
  // 一時的に重複しても問題なく、2行の更新だけで済む）
  async function saveProbMeta(p) {
    const title = editProbTitle.trim()
    const raw = editProbNo.trim()
    // 空欄は「変更しない」扱い（番号を消せてしまうと並び順が崩れるため）
    const no = raw === '' ? p.displayNo : Number(raw)
    if (no !== null && (!Number.isInteger(no) || no < 1)) {
      setStatus('番号は1以上の整数で入力してください')
      return
    }

    const tasks = []
    if (no !== p.displayNo) {
      const conflict = problems.find(x => x.id !== p.id && x.displayNo === no)
      if (conflict) {
        tasks.push(supabase.from('user_problems')
          .update({ display_no: p.displayNo }).eq('id', conflict.id).select('id'))
      }
    }
    tasks.push(supabase.from('user_problems')
      .update({ title, display_no: no, category_id: editProbCat || null })
      .eq('id', p.id).select('id'))

    const settled = await Promise.all(tasks)
    const failed = settled.find(r => r.error)
    if (failed) { setStatus(`変更に失敗しました: ${failed.error.message}`); return }
    if (settled.some(r => !r.data || r.data.length === 0)) {
      setStatus('変更できませんでした（権限の可能性）')
      return
    }
    setEditingProbId(null)
    setStatus('変更しました ✓')
    await reload()
  }

  async function deleteProblem(p) {
    if (!window.confirm(`問題「${p.title || '（無題）'}」を削除しますか？\nこの操作は取り消せません。`)) return
    const { data, error } = await supabase
      .from('user_problems')
      .delete()
      .eq('id', p.id)
      .select('id')
    if (error) { setStatus(`削除に失敗しました: ${error.message}`); return }
    if (!data || data.length === 0) { setStatus('削除できませんでした（権限の可能性）'); return }
    if (selectedProbId === p.id) setSelectedProbId(null)
    setStatus('問題を削除しました ✓')
    await reload()
  }

  // ===== 認証ガード（ログインしているかどうかだけ） =====
  if (authLoading) {
    return <div className="admin-auth-screen">読み込み中...</div>
  }

  if (!session) {
    return (
      <div className="admin-auth-screen">
        <h1 className="admin-auth-title">my問題集</h1>
        <p className="admin-auth-desc">ログインが必要です</p>
        <button
          className="admin-auth-btn"
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              // href はハッシュ（OAuth 後に付く #access_token=...）やクエリを含むため使わない。
              // 壊れた redirectTo は Redirect URLs にマッチせず、Site URL（本番）へ飛ばされる
              options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
            })
            if (error) console.error('OAuth error:', error)
          }}
        >
          Googleでログイン
        </button>
      </div>
    )
  }

  const uncategorized  = problems.filter(p => p.categoryId == null)
  const visibleProblems = selectedCatId === UNCATEGORIZED
    ? uncategorized
    : (selectedCatId ? problems.filter(p => p.categoryId === selectedCatId) : [])
  const selectedIdx  = visibleProblems.findIndex(p => p.id === selectedProbId)
  const selectedProb = selectedIdx >= 0 ? visibleProblems[selectedIdx] : null

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        {/* 本体からは別タブで開かれるので、ブラウザの「戻る」では帰れない。
            同じタブで出題画面へ移動する（target を付けないこと） */}
        <a className="mp-back-link" href="/">← 座学する麻雀</a>
        <h1 className="admin-sidebar-title">my問題集</h1>

        <div className="mp-cat-list">
          {!ready && !loadError && <p className="mp-empty">読み込んでいます...</p>}
          {loadError && <p className="mp-error">取得エラー: {loadError}</p>}
          {ready && categories.length === 0 && (
            <p className="mp-empty">カテゴリがありません。下の欄から追加してください。</p>
          )}

          {categories.map((cat, i) => {
            const count = problems.filter(p => p.categoryId === cat.id).length
            const isEditing = editingId === cat.id
            return (
              <div
                key={cat.id}
                className={`mp-cat-item${selectedCatId === cat.id ? ' mp-cat-item--active' : ''}`}
              >
                {isEditing ? (
                  <input
                    className="mp-cat-input"
                    value={editingName}
                    autoFocus
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameCategory(cat.id)
                      if (e.key === 'Escape') { setEditingId(null); setEditingName('') }
                    }}
                    onBlur={() => renameCategory(cat.id)}
                  />
                ) : (
                  <button
                    className="mp-cat-name"
                    onClick={() => { setSelectedCatId(cat.id); setSelectedProbId(null) }}
                    onDoubleClick={() => startEditing(cat)}
                    title="クリックで選択・ダブルクリックで名前を変更"
                  >
                    <span className="mp-cat-label">{cat.name}</span>
                    <span className="mp-cat-count">{count}</span>
                  </button>
                )}

                <div className="mp-cat-actions">
                  <button className="mp-icon-btn" onClick={() => moveCategory(i, -1)} disabled={i === 0} title="上へ">↑</button>
                  <button className="mp-icon-btn" onClick={() => moveCategory(i, 1)} disabled={i === categories.length - 1} title="下へ">↓</button>
                  <button className="mp-icon-btn" onClick={() => startEditing(cat)} title="名前を変更">✎</button>
                  <button className="mp-icon-btn mp-icon-btn--danger" onClick={() => deleteCategory(cat)} title="削除">×</button>
                </div>
              </div>
            )
          })}

          {uncategorized.length > 0 && (
            <div className={`mp-cat-item${selectedCatId === UNCATEGORIZED ? ' mp-cat-item--active' : ''}`}>
              <button
                className="mp-cat-name"
                onClick={() => { setSelectedCatId(UNCATEGORIZED); setSelectedProbId(null) }}
              >
                <span className="mp-cat-label">未分類</span>
                <span className="mp-cat-count">{uncategorized.length}</span>
              </button>
            </div>
          )}
        </div>

        <div className="mp-cat-add">
          <input
            className="mp-cat-input"
            placeholder="新しいカテゴリ名"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
          />
          <button className="mp-add-btn" onClick={addCategory} disabled={!newName.trim()}>追加</button>
        </div>

        {/* 選択中カテゴリの問題一覧 */}
        <div className="mp-prob-section">
          <div className="mp-prob-head">
            <span className="mp-prob-head-label">問題</span>
            <div className="mp-prob-head-actions">
              <input
                ref={paifuFileRef}
                type="file"
                accept="application/json,.json"
                className="paifu-file-input"
                onChange={e => { readPaifuFile(e.target.files?.[0]); e.target.value = '' }}
              />
              <button
                className={`mp-add-btn mp-add-btn--sm${view === 'paifu' ? ' mp-add-btn--active' : ''}`}
                onClick={() => {
                  // 読み込み済みならその牌譜の続きへ戻るだけ。未読込ならファイル選択を開く
                  if (paifu) {
                    setDraftCategoryId(selectedCatId === UNCATEGORIZED ? null : selectedCatId)
                    setView('paifu')
                  } else {
                    paifuFileRef.current?.click()
                  }
                }}
                title="牌譜のJSONファイルから局面を切り出して問題にする"
              >
                牌譜から
              </button>
              <button className="mp-add-btn mp-add-btn--sm" onClick={addProblem} disabled={!selectedCatId}>
                ＋ 新しい問題
              </button>
            </div>
          </div>
          <div className="mp-prob-list">
            {!selectedCatId && <p className="mp-empty">カテゴリを選んでください。</p>}
            {selectedCatId && visibleProblems.length === 0 && (
              <p className="mp-empty">問題がありません。「＋ 新しい問題」で追加してください。</p>
            )}
            {visibleProblems.map(p => {
              const isEditingProb = editingProbId === p.id
              // input が2つあるので onBlur では確定しない（片方からもう片方へ移るだけで閉じてしまう）
              const editKeys = e => {
                if (e.key === 'Enter') saveProbMeta(p)
                if (e.key === 'Escape') setEditingProbId(null)
              }
              return (
                <div
                  key={p.id}
                  className={`mp-prob-item${selectedProbId === p.id ? ' mp-prob-item--active' : ''}`}
                >
                  {isEditingProb ? (
                    <div className="mp-prob-edit">
                      <input
                        className="mp-prob-no-input"
                        value={editProbNo}
                        inputMode="numeric"
                        aria-label="番号"
                        onChange={e => setEditProbNo(e.target.value)}
                        onKeyDown={editKeys}
                      />
                      <input
                        className="mp-prob-title-input"
                        value={editProbTitle}
                        autoFocus
                        placeholder="タイトル"
                        aria-label="タイトル"
                        onChange={e => setEditProbTitle(e.target.value)}
                        onKeyDown={editKeys}
                      />
                      {/* カテゴリの変更もここに集約する（エディタ側には置かない） */}
                      <select
                        className="mp-prob-cat-select"
                        value={editProbCat}
                        aria-label="カテゴリ"
                        onChange={e => setEditProbCat(e.target.value)}
                        onKeyDown={editKeys}
                      >
                        <option value="">未分類</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <button
                      className="mp-prob-name"
                      onClick={() => selectProblem(p.id)}
                      onDoubleClick={() => startEditingProb(p)}
                      title="クリックで編集・ダブルクリックで番号/タイトル/カテゴリを変更"
                    >
                      <span className="mp-prob-title">
                        {/* 出題画面と同じ番号。採番前（null）は uuid を出さずに — にする */}
                        <span className="mp-prob-no">#{p.displayNo ?? '—'}</span>
                        <span className="mp-prob-label">{p.title || '（無題）'}</span>
                      </span>
                      <span className="mp-prob-sub">{problemSummary(p)}</span>
                    </button>
                  )}

                  <div className="mp-cat-actions">
                    {isEditingProb ? (
                      <>
                        <button className="mp-icon-btn" onClick={() => saveProbMeta(p)} title="確定">✓</button>
                        <button className="mp-icon-btn" onClick={() => setEditingProbId(null)} title="取消">×</button>
                      </>
                    ) : (
                      <>
                        <button className="mp-icon-btn" onClick={() => startEditingProb(p)} title="番号・タイトル・カテゴリを変更">✎</button>
                        <button
                          className="mp-icon-btn mp-icon-btn--danger"
                          onClick={() => deleteProblem(p)}
                          title="削除"
                        >×</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {status && <p className="mp-status">{status}</p>}

        <div className="mp-sidebar-foot">
          <span className="mp-user">{session.user.email}</span>
          <button className="mp-text-btn" onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
      </aside>

      <main className="admin-main">
        {view === 'paifu' ? (
          // 牌譜から切り出した局面。まだ保存されていないので key で作り直す
          // （局面が変われば手牌も変わるため、入力中の正解・解説は引き継がない）
          <ProblemEditor
            key={`draft-${draftKey}`}
            problem={draftProblem ?? makeNewUserProblem()}
            prevProblem={null}
            hasNext={false}
            hideImage
            hideReviewed
            hideDelete
            // 実在の局面をそのまま出題するのが基本。変えたいときはヘッダーのトグルで解除する
            lockBoard
            hideDisabled
            concealedCounts={concealedCounts}
            paletteAside={<EditorGuide mode="paifu" />}
            headerLead={
              <PaifuImport
                paifu={paifu}
                fileName={paifuFile}
                error={paifuError}
                rounds={paifuRounds}
                roundIndex={draft.roundIndex}
                seat={draft.seat}
                steps={visibleSteps}
                stepIndex={stepIndex}
                stepFilter={draft.filter}
                step={currentStep}
                saved={savedKeys.has(draftKey)}
                categories={categories}
                categoryId={draftCategoryId}
                onPickFile={readPaifuFile}
                // 局が変わるとステップ番号の意味も変わるので先頭に戻す
                onChangeRound={i => setDraft(d => ({ ...d, roundIndex: i, stepIndex: 0 }))}
                // 席と絞り込みは、外れた局面を描画時に寄せるので stepIndex はそのままでよい
                onChangeSeat={i => setDraft(d => ({ ...d, seat: i }))}
                onChangeStep={i => { if (i != null) setDraft(d => ({ ...d, stepIndex: i })) }}
                onChangeFilter={f => setDraft(d => ({ ...d, filter: f }))}
                onChangeCategory={setDraftCategoryId}
              />
            }
            saveStatus={editorStatus && (
              <span className={editorStatus.error ? 'mp-save-err' : 'mp-save-ok'}>
                {editorStatus.text}
              </span>
            )}
            onSave={saveDraft}
            onSaveAndNext={saveDraft}
            onDelete={() => {}}
          />
        ) : selectedProb ? (
          <ProblemPane
            key={selectedProb.id}
            problem={selectedProb}
            prevProblem={selectedIdx > 0 ? visibleProblems[selectedIdx - 1] : null}
            hasNext={selectedIdx < visibleProblems.length - 1}
            onSave={saveProblem}
            onSaveAndNext={saveProblemAndNext}
            saveStatus={editorStatus && (
              <span className={editorStatus.error ? 'mp-save-err' : 'mp-save-ok'}>
                {editorStatus.text}
              </span>
            )}
          />
        ) : (
          <div className="mp-placeholder">
            <p className="mp-placeholder-desc">左のリストから問題を選んでください。</p>
            {/* エディタを開く前にしかできない操作（カテゴリ作成・問題追加）はここで案内する。
                手牌から先の手順はエディタ側のガイド（paletteAside）に出る */}
            <EditorGuide mode="start" />
          </div>
        )}
      </main>
    </div>
  )
}
