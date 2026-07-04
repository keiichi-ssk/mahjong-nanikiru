import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ProblemEditor from './ProblemEditor'
import { BOOKS, sectionNumber, sectionLabel } from '../utils/categoryUtils'
import categoriesData from '../data/categories.json'

function fromDb(p) {
  return {
    ...p,
    problemType:      p.problem_type,
    discardedTile:    p.discarded_tile,
    nakiChoices:      p.naki_choices,
    questionImageUrl: p.question_image_url ?? null,
    // toDbではdora未設定時に''で保存される（bakaze/jikaze/junmeはnull保存）ため、
    // ここで''をnullに正規化しないと再読込後に「未設定」判定（?? / 前問題からの引き継ぎ）が効かなくなる
    dora:             p.dora || null,
    otherDiscard:     p.other_discard ?? null,
  }
}

function toDb(p) {
  return {
    id:                 p.id,
    section:            p.section,
    image:              p.image ?? '',
    tiles:              p.tiles ?? [],
    answer:             p.answer ?? '',
    dora:               p.dora ?? '',
    riichi:             p.riichi ?? null,
    explanation:        p.explanation ?? '',
    reviewed:           p.reviewed ?? false,
    disabled:           p.disabled ?? false,
    melds:              p.melds ?? [],
    problem_type:       p.problemType ?? 'default',
    discarded_tile:     p.discardedTile ?? null,
    naki_choices:       p.nakiChoices ?? [],
    question_image_url: p.questionImageUrl ?? null,
    bakaze:             p.bakaze ?? null,
    jikaze:             p.jikaze ?? null,
    junme:              p.junme  ?? null,
    note:               p.note ?? '',
    other_discard:      p.otherDiscard ?? null,
  }
}

const ALL_MAJOR_CATEGORIES = BOOKS.flatMap(b => b.majorCategories.map(c => ({ book: b.label, label: c.label })))

export default function AdminApp() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
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
    if (!session) return
    supabase.from('problems').select('*').order('id')
      .then(({ data }) => setProblems((data || []).map(fromDb)))
  }, [session])

  useEffect(() => {
    if (!session || activeTab !== 'users') return
    supabase.from('allowed_users').select('email, allowed_major_categories').order('email')
      .then(({ data }) => setAllowedUsers(data || []))
  }, [session, activeTab])

  async function handleToggleUserCategory(email, categoryLabel, checked) {
    const user = allowedUsers.find(u => u.email === email)
    if (!user) return
    const current = user.allowed_major_categories
    const allLabels = ALL_MAJOR_CATEGORIES.map(c => c.label)
    let next
    if (checked) {
      const base = current ?? []
      next = [...base, categoryLabel]
    } else {
      const base = current ?? allLabels
      next = base.filter(c => c !== categoryLabel)
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

  async function handleSaveAndNext(updated) {
    const withReviewed = { ...updated, reviewed: true }
    setProblems(problems.map(p => (p.id === withReviewed.id ? withReviewed : p)))
    await saveOne(withReviewed)
    if (catIdx < catProblems.length - 1) {
      setSelectedId(catProblems[catIdx + 1].id)
    }
  }

  const addFormBookData  = BOOKS.find(b => b.label === addForm.book)
  const addFormMajorData = addFormBookData?.majorCategories.find(m => m.label === addForm.major)
  const addFormSections  = addFormMajorData
    ? categoriesData.filter(c => c.id >= addFormMajorData.min && c.id <= addFormMajorData.max)
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

  // ===== 認証ガード =====
  if (authLoading) {
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
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const id = parseInt(idJumpInput)
                const target = problems.find(p => p.id === id)
                if (target) {
                  setSelectedCat(target.section)
                  setSelectedId(target.id)
                  setIdJumpInput('')
                }
              }
            }}
          />
          <button
            className="admin-id-jump-btn"
            onClick={() => {
              const id = parseInt(idJumpInput)
              const target = problems.find(p => p.id === id)
              if (target) {
                setSelectedCat(target.section)
                setSelectedId(target.id)
                setIdJumpInput('')
              }
            }}
          >移動</button>
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
                      const isChecked = allowed ? allowed.includes(cat.label) : true
                      return (
                        <label key={cat.label} className="admin-user-cat-row">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => handleToggleUserCategory(user.email, cat.label, e.target.checked)}
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
