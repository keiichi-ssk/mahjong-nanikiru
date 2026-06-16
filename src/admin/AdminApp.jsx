import { useState, useEffect } from 'react'
import ProblemEditor from './ProblemEditor'

function categoryLabel(name) {
  return name.replace(/^\d+_/, '')
}

export default function AdminApp() {
  const [problems, setProblems]         = useState([])
  const [selectedCat, setSelectedCat]   = useState(null)
  const [selectedId, setSelectedId]     = useState(null)
  const [saveStatus, setSaveStatus]     = useState('')

  useEffect(() => {
    fetch('/api/problems')
      .then(r => r.json())
      .then(setProblems)
  }, [])

  const categories = [...new Set(problems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  )

  const catProblems = problems.filter(p => p.section === selectedCat)
  const currentProblem = problems.find(p => p.id === selectedId) ?? null

  async function handleSave(updated) {
    const next = problems.map(p => (p.id === updated.id ? updated : p))
    setProblems(next)
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

  return (
    <div className="admin-layout">
      {/* サイドバー */}
      <aside className="admin-sidebar">
        <h2 className="admin-sidebar-title">問題編集</h2>
        {saveStatus && <div className="admin-save-status">{saveStatus}</div>}
        <div className="admin-cat-list">
          {categories.map(cat => (
            <div key={cat}>
              <button
                className={`admin-cat-btn${selectedCat === cat ? ' admin-cat-btn--active' : ''}`}
                onClick={() => { setSelectedCat(cat); setSelectedId(null) }}
              >
                <span className="admin-cat-label">{categoryLabel(cat)}</span>
                <span className="admin-cat-count">
                  {problems.filter(p => p.section === cat).length}問
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
                      問題 {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* メインエリア */}
      <main className="admin-main">
        {currentProblem ? (
          <ProblemEditor
            key={currentProblem.id}
            problem={currentProblem}
            onSave={handleSave}
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
