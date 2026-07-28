import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ProblemEditor from '../admin/ProblemEditor'
import { toUserDb, fromUserDb, makeNewUserProblem } from '../utils/userProblemMapper'
import { PROBLEM_TYPE_LABELS } from '../utils/problemConstants'
import { normalizeProblemType } from '../utils/judgeUtils'

// 自作問題集（my問題集）の作成画面。
// 計画: docs/user-problems-plan.md
//
// 認証まわりは AdminApp と同じ形にしてある（セッション保持 → allowed_users.is_admin 判定）。
// 当面はスーパー管理者だけに開放するためのUIゲートで、実効防御は user_problems / user_categories の RLS。
// 将来ほかのユーザーへ開放するときは isAdmin のゲートを外すだけでよい。

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
// タイトルとカテゴリは ProblemEditor が知らないのでここで持ち、保存時に混ぜて渡す。
// key={problem.id} で再マウントさせる前提なので、初期 state で組んでよい
// （effect で setState すると cascading render になる）
function ProblemPane({ problem, prevProblem, categories, hasNext, onSave, onSaveAndNext, saveStatus }) {
  const [title, setTitle]           = useState(problem.title ?? '')
  const [categoryId, setCategoryId] = useState(problem.categoryId ?? '')

  // 保存時にタイトル・カテゴリで上書きする（buildSaveData は {...problem} なので古い値が入っている）
  const withMeta = updated => ({ ...updated, title, categoryId: categoryId || null })

  const headerLead = (
    <div className="mp-editor-lead">
      <input
        className="mp-title-input"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="タイトル（任意）"
      />
      <select
        className="mp-cat-select"
        value={categoryId}
        onChange={e => setCategoryId(e.target.value)}
        title="カテゴリ"
      >
        <option value="">未分類</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )

  return (
    <ProblemEditor
      problem={problem}
      prevProblem={prevProblem}
      hasNext={hasNext}
      hideImage
      hideReviewed
      hideDelete
      headerLead={headerLead}
      saveStatus={saveStatus}
      onSave={u => onSave(withMeta(u))}
      onSaveAndNext={u => onSaveAndNext(withMeta(u))}
      onDelete={() => {}}
    />
  )
}

export default function MyProblemsApp() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  // 管理者判定。どのメールに対する判定かをセットで持ち、
  // ログアウト・アカウント切替時は描画側で自動的に「判定中」へ戻す
  const [adminCheck, setAdminCheck]   = useState(null) // { email, isAdmin } | null

  const [categories, setCategories] = useState([])
  const [problems, setProblems]     = useState([])
  const [ready, setReady]           = useState(false)
  const [loadError, setLoadError]   = useState(null)

  const [selectedCatId, setSelectedCatId]   = useState(null)
  const [selectedProbId, setSelectedProbId] = useState(null)
  const [newName, setNewName]               = useState('')
  const [editingId, setEditingId]           = useState(null)
  const [editingName, setEditingName]       = useState('')
  // 問題一覧での番号・タイトルの直接編集
  const [editingProbId, setEditingProbId]   = useState(null)
  const [editProbTitle, setEditProbTitle]   = useState('')
  const [editProbNo, setEditProbNo]         = useState('')
  const [status, setStatus]                 = useState('')
  // 保存ボタンの隣に出す状態表示。{ text, error } | null
  // 成功は数秒で自動的に消す（消えずに残っていると、次の保存で変化が無く保存されたか分からないため）
  const [editorStatus, setEditorStatus]     = useState(null)
  const editorStatusTimer                   = useRef(null)

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

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false
    const email = session.user.email
    supabase
      .from('allowed_users')
      .select('is_admin')
      .eq('email', email)
      .single()
      .then(({ data, error }) => {
        if (!cancelled) setAdminCheck({ email, isAdmin: !error && data?.is_admin === true })
      })
    return () => { cancelled = true }
  }, [session])

  // null = 判定中
  const isAdmin = (session && adminCheck?.email === session.user.email) ? adminCheck.isAdmin : null
  const userId  = session?.user?.id ?? null

  useEffect(() => {
    if (!session || isAdmin !== true) return undefined
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
  }, [session, isAdmin])

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

  async function addProblem() {
    if (!userId || !selectedCatId) return
    const categoryId = selectedCatId === UNCATEGORIZED ? null : selectedCatId
    // user_id は insert のときだけ付ける（toUserDb は含めない）
    const row = { ...toUserDb(makeNewUserProblem(), { categoryId }), user_id: userId }
    const { data, error } = await supabase.from('user_problems').insert(row).select('*')
    if (error) { setStatus(`問題の追加に失敗しました: ${error.message}`); return }
    if (!data || data.length === 0) { setStatus('追加できませんでした（権限の可能性）'); return }
    await reload()
    setSelectedProbId(data[0].id)
    setStatus('問題を追加しました ✓')
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
    if (i >= 0 && i < list.length - 1) setSelectedProbId(list[i + 1].id)
  }

  function startEditingProb(p) {
    setEditingProbId(p.id)
    setEditProbTitle(p.title ?? '')
    setEditProbNo(String(p.displayNo ?? ''))
  }

  // 一覧から番号とタイトルを直接変更する。
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
      .update({ title, display_no: no }).eq('id', p.id).select('id'))

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

  // ===== 認証ガード =====
  if (authLoading || (session && isAdmin === null)) {
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

  if (!isAdmin) {
    return (
      <div className="admin-auth-screen">
        <h1 className="admin-auth-title">my問題集</h1>
        <p className="admin-auth-desc">この画面はまだ公開されていません</p>
        <button className="admin-auth-btn" onClick={() => supabase.auth.signOut()}>
          ログアウト
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
            <button className="mp-add-btn mp-add-btn--sm" onClick={addProblem} disabled={!selectedCatId}>
              ＋ 新しい問題
            </button>
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
                    </div>
                  ) : (
                    <button
                      className="mp-prob-name"
                      onClick={() => setSelectedProbId(p.id)}
                      onDoubleClick={() => startEditingProb(p)}
                      title="クリックで編集・ダブルクリックで番号とタイトルを変更"
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
                        <button className="mp-icon-btn" onClick={() => startEditingProb(p)} title="番号・タイトルを変更">✎</button>
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
        {selectedProb ? (
          <ProblemPane
            key={selectedProb.id}
            problem={selectedProb}
            prevProblem={selectedIdx > 0 ? visibleProblems[selectedIdx - 1] : null}
            categories={categories}
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
          </div>
        )}
      </main>
    </div>
  )
}
