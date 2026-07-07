import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ProblemEditor from './ProblemEditor'
import { BOOKS, ALL_MAJOR_CATEGORIES, majorCategoryKey, sectionNumber, sectionLabel } from '../utils/categoryUtils'
import { fromDb, toDb } from '../utils/problemMapper'
import categoriesData from '../data/categories.json'

// allowed_major_categories の値を複合キー（"書籍::大カテゴリ"）に正規化する。
// レガシー裸ラベルは該当する全書籍の複合キーに展開（現行の実効挙動を保存）、
// どの大カテゴリにも一致しない旧ラベルは除去する
function normalizeAllowedKeys(list) {
  const out = new Set()
  for (const v of list) {
    if (v.includes('::')) { out.add(v); continue }
    ALL_MAJOR_CATEGORIES.filter(c => c.label === v).forEach(c => out.add(c.key))
  }
  return [...out]
}

export default function AdminApp() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  // 管理者判定（allowed_users.is_admin）。どのメールに対する判定かをセットで持ち、
  // ログアウト・アカウント切替時は描画側で自動的に「判定中」へ戻す
  const [adminCheck, setAdminCheck]   = useState(null) // { email, isAdmin } | null
  const [problems, setProblems]       = useState([])
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedId, setSelectedId]   = useState(null)
  const [idJumpInput, setIdJumpInput] = useState('')
  const [saveStatus, setSaveStatus]   = useState('')
  const [activeTab, setActiveTab]     = useState('problems')
  const [addForm, setAddForm]         = useState({ book: '', major: '', section: '' })
  const [allowedUsers, setAllowedUsers] = useState([])
  const [selectedUserEmail, setSelectedUserEmail] = useState(null)
  const [userSaveStatus, setUserSaveStatus] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')

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

  // null = 判定中。書き込みはRLSで管理者のみに制限済みだが、非管理者には画面自体を開かせない
  const isAdmin = (session && adminCheck?.email === session.user.email) ? adminCheck.isAdmin : null

  useEffect(() => {
    if (!session || isAdmin !== true) return
    supabase.from('problems').select('*').order('id')
      .then(({ data }) => setProblems((data || []).map(fromDb)))
  }, [session, isAdmin])

  useEffect(() => {
    if (!session || isAdmin !== true || activeTab !== 'users') return
    supabase.from('allowed_users').select('email, allowed_major_categories').order('email')
      .then(({ data }) => setAllowedUsers(data || []))
  }, [session, isAdmin, activeTab])

  async function handleToggleUserCategory(email, categoryKey, checked) {
    const user = allowedUsers.find(u => u.email === email)
    if (!user) return
    const current = user.allowed_major_categories
    const allKeys = ALL_MAJOR_CATEGORIES.map(c => c.key)
    let next
    if (checked) {
      next = [...new Set([...normalizeAllowedKeys(current ?? []), categoryKey])]
    } else {
      const base = current === null || current === undefined ? allKeys : normalizeAllowedKeys(current)
      next = base.filter(k => k !== categoryKey)
      if (next.length === 0) next = null
    }
    const { error } = await supabase
      .from('allowed_users')
      .update({ allowed_major_categories: next })
      .eq('email', email)
    if (error) {
      console.error('[handleToggleUserCategory]', error)
      setUserSaveStatus(`保存失敗: ${error.message}`)
    } else {
      setAllowedUsers(prev => prev.map(u => u.email === email ? { ...u, allowed_major_categories: next } : u))
      setUserSaveStatus('保存しました ✓')
    }
    setTimeout(() => setUserSaveStatus(''), 2000)
  }

  async function handleAddUser() {
    const email = newUserEmail.trim()
    if (!email) return
    const { error } = await supabase.from('allowed_users').insert({ email })
    if (error) {
      setUserSaveStatus('追加失敗 ✗')
    } else {
      setAllowedUsers(prev => [...prev, { email, allowed_major_categories: null }].sort((a, b) => a.email.localeCompare(b.email)))
      setNewUserEmail('')
      setUserSaveStatus(`${email} を追加しました ✓`)
    }
    setTimeout(() => setUserSaveStatus(''), 3000)
  }

  async function handleRemoveUser(email) {
    if (!window.confirm(`${email} をアクセス許可リストから削除しますか？`)) return
    const { error } = await supabase.from('allowed_users').delete().eq('email', email)
    if (error) {
      setUserSaveStatus('削除失敗 ✗')
    } else {
      setAllowedUsers(prev => prev.filter(u => u.email !== email))
      if (selectedUserEmail === email) setSelectedUserEmail(null)
      setUserSaveStatus(`${email} を削除しました ✓`)
    }
    setTimeout(() => setUserSaveStatus(''), 3000)
  }

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  )

  const catProblems = problems.filter(p => p.section === selectedCat)
  const catIdx = catProblems.findIndex(p => p.id === selectedId)
  const currentProblem = catIdx >= 0 ? catProblems[catIdx] : null

  async function saveOne(updated) {
    setSaveStatus('保存中...')
    const { error } = await supabase.from('problems').upsert(toDb(updated))
    if (error) {
      setSaveStatus('保存失敗 ✗')
    } else {
      setSaveStatus('保存しました ✓')
    }
    setTimeout(() => setSaveStatus(''), 2000)
  }

  async function handleSave(updated) {
    setProblems(problems.map(p => (p.id === updated.id ? updated : p)))
    await saveOne(updated)
  }

  // reviewed の扱い（自動チェックか手動状態の尊重か）は ProblemEditor 側で決定済み
  async function handleSaveAndNext(updated) {
    setProblems(problems.map(p => (p.id === updated.id ? updated : p)))
    await saveOne(updated)
    if (catIdx < catProblems.length - 1) {
      setSelectedId(catProblems[catIdx + 1].id)
    }
  }

  const addFormBookData  = BOOKS.find(b => b.label === addForm.book)
  const addFormSections  = addForm.book && addForm.major
    ? categoriesData.filter(c => c.book === addForm.book && c.major === addForm.major)
    : []

  function makeNewProblem(section, id) {
    return {
      id,
      section,
      image:            '',
      tiles:            [],
      answer:           '',
      dora:             null,
      riichi:           null,
      melds:            [],
      explanation:      '',
      reviewed:         false,
      disabled:         false,
      problemType:      'default',
      discardedTile:    null,
      nakiChoices:      [],
      questionImageUrl: null,
      note:             '',
      otherDiscard:     null,
    }
  }

  async function handleAddFromForm() {
    if (!addForm.section) return
    const maxId = problems.reduce((m, p) => Math.max(m, p.id), 0)
    const newProblem = makeNewProblem(String(addForm.section), maxId + 1)
    const { error } = await supabase.from('problems').insert(toDb(newProblem))
    if (!error) {
      setProblems(prev => [...prev, newProblem])
      setSelectedCat(String(addForm.section))
      setSelectedId(newProblem.id)
      setAddForm({ book: '', major: '', section: '' })
    }
  }

  async function handleAddProblem() {
    if (!selectedCat) return
    const maxId = problems.reduce((m, p) => Math.max(m, p.id), 0)
    const newProblem = makeNewProblem(selectedCat, maxId + 1)
    const { error } = await supabase.from('problems').insert(toDb(newProblem))
    if (!error) {
      setProblems([...problems, newProblem])
      setSelectedId(newProblem.id)
    }
  }

  const handlePrev = useCallback(() => {
    if (catIdx > 0) setSelectedId(catProblems[catIdx - 1].id)
  }, [catIdx, catProblems])

  const handleNext = useCallback(() => {
    if (catIdx < catProblems.length - 1) setSelectedId(catProblems[catIdx + 1].id)
  }, [catIdx, catProblems])

  useEffect(() => {
    function onKeyDown(e) {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (!selectedId) return
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlePrev, handleNext, selectedId])

  function jumpToId() {
    const id = parseInt(idJumpInput)
    const target = problems.find(p => p.id === id)
    if (target) {
      setSelectedCat(target.section)
      setSelectedId(target.id)
      setIdJumpInput('')
    }
  }

  // ===== 認証ガード =====
  if (authLoading || (session && isAdmin === null)) {
    return <div className="admin-auth-screen">読み込み中...</div>
  }

  if (!session) {
    return (
      <div className="admin-auth-screen">
        <h1 className="admin-auth-title">管理画面</h1>
        <p className="admin-auth-desc">ログインが必要です</p>
        <button
          className="admin-auth-btn"
          onClick={() => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href },
          })}
        >
          Googleでログイン
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-auth-screen">
        <h1 className="admin-auth-title">管理画面</h1>
        <p className="admin-auth-desc">このアカウントには管理者権限がありません</p>
        <button className="admin-auth-btn" onClick={() => supabase.auth.signOut()}>
          ログアウト
        </button>
      </div>
    )
  }

  // ===== 管理画面本体 =====
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-tab-bar">
          <button
            className={`admin-tab-btn${activeTab === 'problems' ? ' admin-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('problems')}
          >問題編集</button>
          <button
            className={`admin-tab-btn${activeTab === 'users' ? ' admin-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('users')}
          >ユーザー管理</button>
        </div>
        {saveStatus && <div className="admin-save-status">{saveStatus}</div>}
        <div className="admin-id-jump" style={{ display: activeTab === 'problems' ? undefined : 'none' }}>
          <input
            className="admin-id-jump-input"
            type="number"
            placeholder="IDで移動…"
            value={idJumpInput}
            onChange={e => setIdJumpInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && jumpToId()}
          />
          <button className="admin-id-jump-btn" onClick={jumpToId}>移動</button>
        </div>
        <div className="admin-new-problem-form" style={{ display: activeTab === 'problems' ? undefined : 'none' }}>
          <div className="admin-new-problem-title">新規問題追加</div>
          <select
            className="admin-new-problem-select"
            value={addForm.book}
            onChange={e => setAddForm({ book: e.target.value, major: '', section: '' })}
          >
            <option value="">書籍を選択...</option>
            {BOOKS.map(b => <option key={b.label} value={b.label}>{b.label}</option>)}
          </select>
          <select
            className="admin-new-problem-select"
            value={addForm.major}
            onChange={e => setAddForm(f => ({ ...f, major: e.target.value, section: '' }))}
            disabled={!addForm.book}
          >
            <option value="">大カテゴリ...</option>
            {(addFormBookData?.majorCategories ?? []).map(m => (
              <option key={m.label} value={m.label}>{m.label}</option>
            ))}
          </select>
          <select
            className="admin-new-problem-select"
            value={addForm.section}
            onChange={e => setAddForm(f => ({ ...f, section: e.target.value }))}
            disabled={!addForm.major}
          >
            <option value="">小カテゴリ...</option>
            {addFormSections.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button
            className="admin-new-problem-btn"
            onClick={handleAddFromForm}
            disabled={!addForm.section}
          >
            ＋ 問題を追加
          </button>
        </div>

        <div className="admin-cat-list" style={{ display: activeTab === 'problems' ? undefined : 'none' }}>
          {categories.map(cat => {
            const catItems    = problems.filter(p => p.section === cat)
            const catTotal    = catItems.length
            const catReviewed = catItems.filter(p => p.reviewed).length
            const allDone     = catReviewed === catTotal
            const ids         = catItems.map(p => p.id)
            const minId       = ids.length ? Math.min(...ids) : null
            const maxId       = ids.length ? Math.max(...ids) : null
            const idRange     = minId !== null ? (minId === maxId ? `#${minId}` : `#${minId}~#${maxId}`) : ''
            return (
              <div key={cat}>
                <button
                  className={`admin-cat-btn${selectedCat === cat ? ' admin-cat-btn--active' : ''}`}
                  onClick={() => { setSelectedCat(cat); setSelectedId(null) }}
                >
                  <span className="admin-cat-id">No.{sectionNumber(cat)}</span>
                  <span className="admin-cat-label">{sectionLabel(cat)}</span>
                  <span className="admin-cat-id-range">{idRange}</span>
                  <span className={`admin-cat-progress${allDone ? ' admin-cat-progress--done' : ''}`}>
                    {catReviewed}/{catTotal}
                  </span>
                </button>
                {selectedCat === cat && (
                  <div className="admin-problem-list">
                    {catProblems.map((p, i) => (
                      <button
                        key={p.id}
                        className={`admin-problem-btn${selectedId === p.id ? ' admin-problem-btn--active' : ''}${p.disabled ? ' admin-problem-btn--disabled' : ''}`}
                        onClick={() => setSelectedId(p.id)}
                      >
                        <span className="admin-problem-label">
                          <span className="admin-problem-id">#{p.id}</span>
                          <span>問題 {i + 1}</span>
                        </span>
                        <span className="admin-problem-badges">
                          {p.disabled && <span className="admin-disabled-badge">非表示</span>}
                          {p.reviewed && <span className="admin-reviewed-badge">✓</span>}
                        </span>
                      </button>
                    ))}
                    <button className="admin-add-problem-btn" onClick={handleAddProblem}>
                      ＋ 問題を追加
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {activeTab === 'users' && (
          <div className="admin-user-list">
            {userSaveStatus && <div className="admin-save-status">{userSaveStatus}</div>}
            <div className="admin-user-add-row">
              <input
                className="admin-user-email-input"
                type="email"
                placeholder="メールアドレス"
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddUser()}
              />
              <button className="admin-user-add-btn" onClick={handleAddUser}>追加</button>
            </div>
            {allowedUsers.map(user => (
              <button
                key={user.email}
                className={`admin-user-btn${selectedUserEmail === user.email ? ' admin-user-btn--active' : ''}`}
                onClick={() => setSelectedUserEmail(user.email)}
              >
                <span className="admin-user-email">{user.email}</span>
                <span className="admin-user-scope">
                  {user.allowed_major_categories ? `${user.allowed_major_categories.length}カテゴリ限定` : '全カテゴリ'}
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="admin-main">
        {activeTab === 'problems' && (currentProblem ? (
          <ProblemEditor
            key={currentProblem.id}
            problem={currentProblem}
            prevProblem={catIdx > 0 ? catProblems[catIdx - 1] : null}
            onSave={handleSave}
            onSaveAndNext={handleSaveAndNext}
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={catIdx > 0}
            hasNext={catIdx < catProblems.length - 1}
            catIdx={catIdx}
            catTotal={catProblems.length}
          />
        ) : (
          <div className="admin-placeholder">
            左のリストからカテゴリーと問題を選んでください
          </div>
        ))}

        {activeTab === 'users' && (() => {
          const user = allowedUsers.find(u => u.email === selectedUserEmail)
          if (!user) return (
            <div className="admin-placeholder">
              左のリストからユーザーを選んでください
            </div>
          )
          const allowed = user.allowed_major_categories
          return (
            <div className="admin-user-editor">
              <div className="admin-user-editor-header">
                <h2 className="admin-user-editor-email">{user.email}</h2>
                <button className="admin-user-remove-btn" onClick={() => handleRemoveUser(user.email)}>
                  削除
                </button>
              </div>
              <p className="admin-user-scope-note">
                {allowed ? `${allowed.length}カテゴリ限定表示` : '全カテゴリ表示（制限なし）'}
              </p>
              <div className="admin-user-categories">
                {BOOKS.map(book => (
                  <div key={book.label} className="admin-user-book">
                    <h3 className="admin-user-book-label">{book.label}</h3>
                    {book.majorCategories.map(cat => {
                      const key = majorCategoryKey(book.label, cat.label)
                      // 複合キーに加え、SQL移行前のレガシー裸ラベルもチェック済みとして表示する
                      const isChecked = allowed ? (allowed.includes(key) || allowed.includes(cat.label)) : true
                      return (
                        <label key={key} className="admin-user-cat-row">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => handleToggleUserCategory(user.email, key, e.target.checked)}
                          />
                          <span>{cat.label}</span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="admin-user-reset-row">
                <button
                  className="admin-user-reset-btn"
                  onClick={async () => {
                    const { error } = await supabase.from('allowed_users').update({ allowed_major_categories: null }).eq('email', user.email)
                    if (!error) {
                      setAllowedUsers(prev => prev.map(u => u.email === user.email ? { ...u, allowed_major_categories: null } : u))
                      setUserSaveStatus('制限を解除しました ✓')
                      setTimeout(() => setUserSaveStatus(''), 2000)
                    }
                  }}
                >
                  制限を解除（全カテゴリ表示に戻す）
                </button>
              </div>
            </div>
          )
        })()}
      </main>
    </div>
  )
}
