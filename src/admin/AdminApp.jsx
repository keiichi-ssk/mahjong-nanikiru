import { useState, useEffect, useCallback } from 'react'
import ProblemEditor from './ProblemEditor'

function categoryLabel(name) {
  return name.replace(/^\d+_/, '')
}

export default function AdminApp() {
  const [problems, setProblems]       = useState([])
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedId, setSelectedId]   = useState(null)
  const [saveStatus, setSaveStatus]   = useState('')

  useEffect(() => {
    fetch('/api/problems')
      .then(r => r.json())
      .then(setProblems)
  }, [])

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  )

  const catProblems = problems.filter(p => p.section === selectedCat)
  const catIdx = catProblems.findIndex(p => p.id === selectedId)
  const currentProblem = catIdx >= 0 ? catProblems[catIdx] : null

  async function saveToServer(next) {
    setSaveStatus('保存中...')
    try {
      await fetch('/api/problems', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next, null, 2),
      })
      setSaveStatus('保存しました ✓')
    } catch {
      setSaveStatus('保存失敗 ✗')
    }
    setTimeout(() => setSaveStatus(''), 2000)
  }

  async function handleSave(updated) {
    const next = problems.map(p => (p.id === updated.id ? updated : p))
    setProblems(next)
    await saveToServer(next)
  }

  async function handleSaveAndNext(updated) {
    const withReviewed = { ...updated, reviewed: true }
    const next = problems.map(p => (p.id === withReviewed.id ? withReviewed : p))
    setProblems(next)
    await saveToServer(next)
    if (catIdx < catProblems.length - 1) {
      setSelectedId(catProblems[catIdx + 1].id)
    }
  }

  async function handleAddProblem() {
    if (!selectedCat) return
    const maxId = problems.reduce((m, p) => Math.max(m, p.id), 0)
    const newProblem = {
      id: maxId + 1,
      section: selectedCat,
      image: '',
      tiles: [],
      answer: '',
      dora: null,
      riichi: null,
      melds: [],
      explanation: '',
      reviewed: false,
      problemType: 'default',
      discardedTile: null,
      nakiChoices: [],
    }
    const next = [...problems, newProblem]
    setProblems(next)
    await saveToServer(next)
    setSelectedId(newProblem.id)
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
                        className={`admin-problem-btn${selectedId === p.id ? ' admin-problem-btn--active' : ''}`}
                        onClick={() => setSelectedId(p.id)}
                      >
                        <span>問題 {i + 1}</span>
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
