import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ProblemEditor from './ProblemEditor'

function categoryLabel(name) {
  return name.replace(/^\d+_/, '')
}

function fromDb(p) {
  return {
    ...p,
    problemType:   p.problem_type,
    discardedTile: p.discarded_tile,
    nakiChoices:   p.naki_choices,
  }
}

function toDb(p) {
  return {
    id:             p.id,
    section:        p.section,
    image:          p.image ?? '',
    tiles:          p.tiles ?? [],
    answer:         p.answer ?? '',
    dora:           p.dora ?? '',
    riichi:         p.riichi ?? null,
    explanation:    p.explanation ?? '',
    reviewed:       p.reviewed ?? false,
    disabled:       p.disabled ?? false,
    melds:          p.melds ?? [],
    problem_type:   p.problemType ?? 'default',
    discarded_tile: p.discardedTile ?? null,
    naki_choices:   p.nakiChoices ?? [],
  }
}

export default function AdminApp() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [problems, setProblems]       = useState([])
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedId, setSelectedId]   = useState(null)
  const [saveStatus, setSaveStatus]   = useState('')

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

  async function handleAddProblem() {
    if (!selectedCat) return
    const maxId = problems.reduce((m, p) => Math.max(m, p.id), 0)
    const newProblem = {
      id:            maxId + 1,
      section:       selectedCat,
      image:         '',
      tiles:         [],
      answer:        '',
      dora:          null,
      riichi:        null,
      melds:         [],
      explanation:   '',
      reviewed:      false,
      disabled:      false,
      problemType:   'default',
      discardedTile: null,
      nakiChoices:   [],
    }
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
        <h2 className="admin-sidebar-title">問題編集</h2>
        {saveStatus && <div className="admin-save-status">{saveStatus}</div>}
        <div className="admin-cat-list">
          {categories.map(cat => {
            const catTotal    = problems.filter(p => p.section === cat).length
            const catReviewed = problems.filter(p => p.section === cat && p.reviewed).length
            const allDone     = catReviewed === catTotal
            return (
              <div key={cat}>
                <button
                  className={`admin-cat-btn${selectedCat === cat ? ' admin-cat-btn--active' : ''}`}
                  onClick={() => { setSelectedCat(cat); setSelectedId(null) }}
                >
                  <span className="admin-cat-label">{categoryLabel(cat)}</span>
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
                        <span>問題 {i + 1}</span>
                        {p.disabled && <span className="admin-disabled-badge">非表示</span>}
                        {p.reviewed && <span className="admin-reviewed-badge">✓</span>}
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
      </aside>

      <main className="admin-main">
        {currentProblem ? (
          <ProblemEditor
            key={currentProblem.id}
            problem={currentProblem}
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
        )}
      </main>
    </div>
  )
}
