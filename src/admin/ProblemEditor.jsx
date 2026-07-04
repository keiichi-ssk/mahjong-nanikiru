import { useState, useEffect, useCallback, useRef } from 'react'
import { getTileImageUrl, getTileLabel } from '../utils/tileUtils'
import { supabase } from '../lib/supabase'

const TILE_GROUPS = [
  { label: '萬子', tiles: ['1m','2m','3m','4m','5m','0m','6m','7m','8m','9m'] },
  { label: '筒子', tiles: ['1p','2p','3p','4p','5p','0p','6p','7p','8p','9p'] },
  { label: '索子', tiles: ['1s','2s','3s','4s','5s','0s','6s','7s','8s','9s'] },
  { label: '字牌', tiles: ['1z','2z','3z','4z','5z','6z','7z'] },
]

const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3 }

const MELD_LABELS     = { chi: 'チー', pon: 'ポン', kan: '大明槓', kakan: '加槓', ankan: '暗槓' }
const MELD_TILE_COUNT = { chi: 3, pon: 3, kan: 4, kakan: 4, ankan: 4 }
const MELD_TYPES      = ['chi', 'pon', 'kan', 'kakan', 'ankan']

const NAKI_TIMING_OPTIONS = [
  { value: 'early', label: '序盤から鳴く' },
  { value: 'mid',   label: '中盤から鳴く' },
  { value: 'late',  label: '終盤から鳴く' },
  { value: 'no',    label: '鳴かない' },
]

function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    const suitA = a.slice(-1), suitB = b.slice(-1)
    if (suitA !== suitB) return SUIT_ORDER[suitA] - SUIT_ORDER[suitB]
    const nA = a[0] === '0' ? 5.5 : parseInt(a[0])
    const nB = b[0] === '0' ? 5.5 : parseInt(b[0])
    return nA - nB
  })
}

function TileImg({ tile, size = 44, onClick, className = '' }) {
  const url = getTileImageUrl(tile)
  return (
    <button className={`tile-btn ${className}`} onClick={onClick} title={getTileLabel(tile)}>
      {url
        ? <img src={url} width={size} height={Math.round(size * 60 / 44)} alt={tile} />
        : <span className="tile-code">{tile}</span>
      }
    </button>
  )
}

function MeldPreview({ meld }) {
  const { type, tiles } = meld
  return (
    <div className="meld-preview">
      {tiles.map((t, i) => {
        const isRotated = type !== 'ankan' && i === 0
        const isBack    = type === 'ankan' && (i === 0 || i === 3)
        if (isBack) return <div key={i} className="meld-preview-back" />
        return (
          <div key={i} className={`meld-preview-tile${isRotated ? ' meld-preview-tile--rotated' : ''}`}>
            <img src={getTileImageUrl(t)} alt={t} width={30} height={Math.round(30 * 60 / 44)} />
          </div>
        )
      })}
    </div>
  )
}

function parseTilesText(text) {
  const result = []
  let buf = []
  for (const ch of text.trim()) {
    if ('0123456789'.includes(ch)) {
      buf.push(ch)
    } else if ('mpsz'.includes(ch)) {
      for (const n of buf) result.push(n + ch)
      buf = []
    }
  }
  return result
}

export default function ProblemEditor({
  problem, prevProblem, onSave, onSaveAndNext, onPrev, onNext, hasPrev, hasNext, catIdx, catTotal,
}) {
  // 手牌が未設定（新規追加直後）の問題は、手牌・正解・状況設定（ドラ・場風・自風・巡目）を
  // ひとつ前の問題から引き継いでおく。手牌がすでにある問題は自分自身の値を優先する。
  const inheritFromPrev = (problem.tiles ?? []).length === 0 && !!prevProblem

  const [tiles,         setTiles]         = useState(
    sortTiles(inheritFromPrev ? (prevProblem.tiles ?? []) : problem.tiles)
  )
  const [answer,        setAnswer]        = useState(
    problem.answer || (inheritFromPrev ? (prevProblem.answer || '') : '')
  )
  const [dora,          setDora]          = useState(problem.dora ?? (inheritFromPrev ? prevProblem.dora ?? null : null))
  const [riichi,        setRiichi]        = useState(problem.riichi ?? (inheritFromPrev ? prevProblem.riichi ?? null : null))
  const [melds,         setMelds]         = useState(problem.melds ?? [])
  const [explanation,   setExplanation]   = useState(problem.explanation ?? '')
  const [reviewed,      setReviewed]      = useState(problem.reviewed ?? false)
  const [disabled,      setDisabled]      = useState(problem.disabled ?? false)
  const [addingMeld,    setAddingMeld]    = useState(null)
  const [problemType,   setProblemType]   = useState(problem.problemType   ?? 'default')
  const [discardedTile, setDiscardedTile] = useState(problem.discardedTile ?? null)
  const [nakiChoices,   setNakiChoices]   = useState(problem.nakiChoices   ?? [])
  const [tilesInput,       setTilesInput]       = useState('')
  const [questionImageUrl, setQuestionImageUrl] = useState(problem.questionImageUrl ?? null)
  const [imageUploading,   setImageUploading]   = useState(false)
  const [bakaze,           setBakaze]           = useState(problem.bakaze ?? (inheritFromPrev ? prevProblem.bakaze ?? null : null))
  const [jikaze,           setJikaze]           = useState(problem.jikaze ?? (inheritFromPrev ? prevProblem.jikaze ?? null : null))
  const [junme,            setJunme]            = useState(problem.junme  ?? (inheritFromPrev ? prevProblem.junme  ?? null : null))
  const [note,             setNote]             = useState(problem.note ?? '')
  const otherDiscardBase = problem.otherDiscard ?? (inheritFromPrev ? prevProblem.otherDiscard ?? null : null)
  const [otherDiscardPlayer,     setOtherDiscardPlayer]     = useState(otherDiscardBase?.player ?? null)
  const [otherDiscardTiles,      setOtherDiscardTiles]      = useState(otherDiscardBase?.tiles ?? [])
  const [otherDiscardRiichiIndex, setOtherDiscardRiichiIndex] = useState(otherDiscardBase?.riichiIndex ?? null)

  const explanationRef = useRef(null)
  const noteRef        = useRef(null)

  async function handleImageUpload(file) {
    if (!file) return
    setImageUploading(true)
    const ext = file.name.split('.').pop()
    const filename = `${problem.id}.${ext}`
    const { error } = await supabase.storage.from('question-images').upload(filename, file, { upsert: true })
    if (error) {
      alert(`アップロード失敗: ${error.message}`)
      setImageUploading(false)
      return
    }
    const { data } = supabase.storage.from('question-images').getPublicUrl(filename)
    setQuestionImageUrl(data.publicUrl)
    setImageUploading(false)
  }

  function insertTileCode(tile) {
    const ta = explanationRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const code  = `[${tile}]`
    const next  = explanation.slice(0, start) + code + explanation.slice(end)
    setExplanation(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + code.length, start + code.length)
    })
  }

  function insertNoteTileCode(tile) {
    const ta = noteRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const code  = `[${tile}]`
    const next  = note.slice(0, start) + code + note.slice(end)
    setNote(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + code.length, start + code.length)
    })
  }

  function addTile(tile) {
    setTiles(prev => sortTiles([...prev, tile]))
  }

  function removeTile(index) {
    setTiles(prev => {
      const removed = prev[index]
      const next    = prev.filter((_, i) => i !== index)
      if (answer === removed && !next.includes(removed)) setAnswer('')
      return next
    })
  }

  function startAddMeld(type) { setAddingMeld({ type, tiles: [] }) }

  function addTileToMeld(tile) {
    setAddingMeld(prev => {
      if (!prev) return null
      const maxCount = MELD_TILE_COUNT[prev.type]
      if (prev.tiles.length >= maxCount) return prev
      return { ...prev, tiles: [...prev.tiles, tile] }
    })
  }

  function removeTileFromMeld(index) {
    setAddingMeld(prev => prev ? { ...prev, tiles: prev.tiles.filter((_, i) => i !== index) } : null)
  }

  function confirmMeld() {
    if (!addingMeld) return
    if (addingMeld.tiles.length < MELD_TILE_COUNT[addingMeld.type]) return
    setMelds(prev => [...prev, { type: addingMeld.type, tiles: addingMeld.tiles }])
    setAddingMeld(null)
  }

  function removeMeld(index) {
    setMelds(prev => prev.filter((_, i) => i !== index))
  }

  function addOtherDiscardTile(tile) {
    setOtherDiscardTiles(prev => [...prev, tile])
  }

  function removeOtherDiscardTile(index) {
    setOtherDiscardTiles(prev => prev.filter((_, i) => i !== index))
    setOtherDiscardRiichiIndex(prev => {
      if (prev === null) return null
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
  }

  function toggleOtherDiscardRiichi(index) {
    setOtherDiscardRiichiIndex(prev => prev === index ? null : index)
  }

  function addNakiChoice(tile) {
    if (nakiChoices.some(c => c.tile === tile)) return
    setNakiChoices(prev => [...prev, { tile, correct: false }])
  }

  function toggleNakiChoiceCorrect(index) {
    setNakiChoices(prev => prev.map((c, i) => i === index ? { ...c, correct: !c.correct } : c))
  }

  function removeNakiChoice(index) {
    setNakiChoices(prev => prev.filter((_, i) => i !== index))
  }

  const buildSaveData = useCallback(() => ({
    ...problem,
    tiles,
    answer,
    dora: dora || null,
    riichi,
    melds,
    explanation,
    reviewed,
    disabled,
    problemType,
    discardedTile:    discardedTile || null,
    nakiChoices,
    questionImageUrl: questionImageUrl || null,
    bakaze,
    jikaze,
    junme,
    note,
    otherDiscard: (otherDiscardPlayer || otherDiscardTiles.length > 0)
      ? { player: otherDiscardPlayer, tiles: otherDiscardTiles, riichiIndex: otherDiscardRiichiIndex }
      : null,
  }), [problem, tiles, answer, dora, riichi, melds, explanation, reviewed, disabled, problemType, discardedTile, nakiChoices, questionImageUrl, bakaze, jikaze, junme, note, otherDiscardPlayer, otherDiscardTiles, otherDiscardRiichiIndex])

  const handleSave = useCallback(() => {
    onSave(buildSaveData())
  }, [onSave, buildSaveData])

  const handleSaveAndNext = useCallback(() => {
    onSaveAndNext(buildSaveData())
  }, [onSaveAndNext, buildSaveData])

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveAndNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSaveAndNext])

  const isAddingComplete = addingMeld && addingMeld.tiles.length === MELD_TILE_COUNT[addingMeld.type]

  const [paletteTab, setPaletteTab] = useState('jokyo')

  return (
    <div className="editor">
      {/* ナビゲーションバー */}
      <div className="editor-nav">
        <button className="editor-nav-btn" onClick={onPrev} disabled={!hasPrev} title="前の問題（←キー）">
          ← 前
        </button>
        <span className="editor-nav-pos">{catIdx + 1} / {catTotal}</span>
        <button className="editor-nav-btn" onClick={onNext} disabled={!hasNext} title="次の問題（→キー）">
          次 →
        </button>
      </div>

      {/* ヘッダー */}
      <div className="editor-header">
        <h3 className="editor-title">{problem.section.replace(/^\d+_/, '')} — ID {problem.id}</h3>
        <label className="reviewed-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={e => setReviewed(e.target.checked)}
          />
          修正済み
        </label>
        <label className="reviewed-check" style={{ color: disabled ? '#e74c3c' : undefined }}>
          <input
            type="checkbox"
            checked={disabled}
            onChange={e => setDisabled(e.target.checked)}
          />
          非表示
        </label>
      </div>

      {/* 問題タイプ */}
      <section className="editor-section">
        <div className="editor-section-label">問題タイプ</div>
        <div className="problem-type-selector">
          {[
            { value: 'default',          label: '通常（何切る）' },
            { value: 'riichi-judgment',  label: 'リーチ判断' },
            { value: 'naki-timing',      label: '鳴きタイミング' },
            { value: 'naki-choice',      label: '鳴き選択' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`problem-type-btn${problemType === opt.value ? ' problem-type-btn--active' : ''}`}
              onClick={() => setProblemType(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* 問題画像：Supabase Storageアップロード（全タイプ共通） */}
      <section className="editor-section">
        <div className="editor-section-label">問題画像（任意）</div>
        {questionImageUrl && (
          <div className="editor-image-wrap">
            <img src={questionImageUrl} alt="問題" className="editor-image" />
          </div>
        )}
        <div className="image-upload-row">
          <label className="image-upload-label">
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleImageUpload(e.target.files?.[0])}
              disabled={imageUploading}
            />
            <span className={`image-upload-btn${imageUploading ? ' image-upload-btn--uploading' : ''}`}>
              {imageUploading ? 'アップロード中...' : '画像を選択・アップロード'}
            </span>
          </label>
          {questionImageUrl && (
            <button className="dora-clear" onClick={() => setQuestionImageUrl(null)}>画像を削除</button>
          )}
        </div>
        {questionImageUrl && (
          <div className="editor-current" style={{ wordBreak: 'break-all', fontSize: 11 }}>
            URL: {questionImageUrl}
          </div>
        )}
      </section>

      {/* 参照用画像（scan-tilesで生成した問題のみ） */}
      {problemType !== 'image-quiz' && problem.image && (
        <div className="editor-image-wrap">
          <img src={problem.image} alt="問題" className="editor-image" />
        </div>
      )}

      {/* 現在の手牌 */}
      <section className="editor-section">
        <div className="editor-section-label">
          手牌（クリックで削除）<span className="tile-count">{tiles.length}枚</span>
        </div>
        <div className="editor-hand-row">
          <div className="editor-tiles">
            {tiles.map((t, i) => (
              <TileImg
                key={i}
                tile={t}
                onClick={() => removeTile(i)}
                className={`editor-tile ${answer === t ? 'tile--answer' : ''}`}
              />
            ))}
            {tiles.length === 0 && <span className="editor-empty">牌を追加してください</span>}
          </div>
          {melds.length > 0 && (
            <div className="editor-melds-inline">
              {melds.map((meld, i) => (
                <div key={i} className="editor-meld-inline-item">
                  <span className="editor-meld-inline-label">{MELD_LABELS[meld.type]}</span>
                  <MeldPreview meld={meld} />
                  <button className="editor-meld-inline-remove" onClick={() => removeMeld(i)}>×</button>
                </div>
              ))}
            </div>
          )}
          {dora && (
            <div className="editor-dora-inline">
              <span className="editor-dora-label">ドラ</span>
              <img src={getTileImageUrl(dora)} alt={getTileLabel(dora)} width={32} height={Math.round(32 * 60 / 44)} />
            </div>
          )}
        </div>
        <div className="tiles-text-input-row">
          <input
            type="text"
            className="tiles-text-input"
            value={tilesInput}
            onChange={e => setTilesInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const parsed = parseTilesText(tilesInput)
                if (parsed.length > 0) {
                  setTiles(sortTiles(parsed))
                  setTilesInput('')
                }
              }
            }}
            placeholder="例: 23467m234p234888s（Enterで適用）"
          />
          <button
            className="tiles-text-apply-btn"
            onClick={() => {
              const parsed = parseTilesText(tilesInput)
              if (parsed.length > 0) {
                setTiles(sortTiles(parsed))
                setTilesInput('')
              }
            }}
          >
            適用
          </button>
          <button
            className="tiles-text-apply-btn tiles-text-clear-btn"
            onClick={() => setTiles([])}
          >
            全削除
          </button>
        </div>

        {/* 手牌追加パレット */}
        {!addingMeld && (
          <div className="hand-palette-rows">
            {TILE_GROUPS.map(group => (
              <div key={group.label} className="palette-row">
                <span className="palette-label">{group.label}</span>
                <div className="palette-tiles">
                  {group.tiles.map(t => (
                    <TileImg key={t} tile={t} size={36} onClick={() => addTile(t)} className="palette-tile" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="palette-tab-divider" />
        <div className="editor-section-label">副露（鳴き）</div>
        {addingMeld ? (
          <div className="meld-adding">
            <div className="meld-adding-header">
              <span className="meld-adding-title">
                {MELD_LABELS[addingMeld.type]}：牌を選択
                （{addingMeld.tiles.length} / {MELD_TILE_COUNT[addingMeld.type]}枚）
              </span>
              <button className="meld-cancel-btn" onClick={() => setAddingMeld(null)}>キャンセル</button>
            </div>
            <div className="meld-selected-tiles">
              {addingMeld.tiles.map((t, i) => (
                <TileImg key={i} tile={t} size={36} onClick={() => removeTileFromMeld(i)} className="editor-tile" />
              ))}
              {Array.from({ length: MELD_TILE_COUNT[addingMeld.type] - addingMeld.tiles.length }).map((_, i) => (
                <div key={`empty-${i}`} className="meld-tile-slot" />
              ))}
            </div>
            <div className="meld-palette">
              {TILE_GROUPS.map(group => (
                <div key={group.label} className="palette-row">
                  <span className="palette-label">{group.label}</span>
                  <div className="palette-tiles">
                    {group.tiles.map(t => (
                      <TileImg
                        key={t} tile={t} size={32}
                        onClick={() => addTileToMeld(t)}
                        className={`palette-tile${isAddingComplete ? ' palette-tile--disabled' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              className={`meld-confirm-btn${isAddingComplete ? ' meld-confirm-btn--ready' : ''}`}
              onClick={confirmMeld}
              disabled={!isAddingComplete}
            >
              副露を追加
            </button>
          </div>
        ) : (
          <div className="meld-add-btns">
            {MELD_TYPES.map(type => (
              <button key={type} className="meld-add-btn" onClick={() => startAddMeld(type)}>
                {MELD_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* === パレット統合エリア === */}
      <section className="editor-section editor-section--palette">
        <div className="palette-tab-bar">
          <button
            className={`palette-tab-btn${paletteTab === 'jokyo' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => setPaletteTab('jokyo')}
          >
            状況設定
          </button>
          <button
            className={`palette-tab-btn${paletteTab === 'sutehai' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => setPaletteTab('sutehai')}
          >
            他家捨て牌
          </button>
          <button
            className={`palette-tab-btn${paletteTab === 'answer' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => setPaletteTab('answer')}
          >
            正解設定
          </button>
        </div>

        {/* 状況設定タブ */}
        {paletteTab === 'jokyo' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">ドラ</div>
            <div className="palette-tab-status">
              現在のドラ: <strong>{dora ? getTileLabel(dora) : 'なし'}</strong>
              <button className="dora-clear" onClick={() => setDora(null)}>なし</button>
            </div>
            {TILE_GROUPS.map(group => (
              <div key={group.label} className="palette-row">
                <span className="palette-label">{group.label}</span>
                <div className="palette-tiles">
                  {group.tiles.map(t => (
                    <TileImg
                      key={t} tile={t} size={36}
                      onClick={() => setDora(t)}
                      className={`palette-tile ${dora === t ? 'tile--answer' : ''}`}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="palette-tab-divider" />
            <div className="editor-section-label">場風</div>
            <div className="situation-selector">
              <button
                className={`situation-btn situation-btn--unset${bakaze === null ? ' situation-btn--active' : ''}`}
                onClick={() => setBakaze(null)}
              >
                未設定
              </button>
              {['東', '南', '西'].map(wind => (
                <button
                  key={wind}
                  className={`situation-btn${bakaze === wind ? ' situation-btn--active' : ''}`}
                  onClick={() => setBakaze(wind)}
                >
                  {wind}場
                </button>
              ))}
            </div>

            <div className="palette-tab-divider" />
            <div className="editor-section-label">自風</div>
            <div className="situation-selector">
              <button
                className={`situation-btn situation-btn--unset${jikaze === null ? ' situation-btn--active' : ''}`}
                onClick={() => setJikaze(null)}
              >
                未設定
              </button>
              {['東', '南', '西', '北'].map(wind => (
                <button
                  key={wind}
                  className={`situation-btn${jikaze === wind ? ' situation-btn--active' : ''}`}
                  onClick={() => setJikaze(wind)}
                >
                  {wind}
                </button>
              ))}
            </div>

            <div className="palette-tab-divider" />
            <div className="editor-section-label">巡目</div>
            <div className="situation-selector">
              <select
                className="junme-select"
                value={junme ?? ''}
                onChange={e => setJunme(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">未設定</option>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}巡目</option>
                ))}
              </select>
            </div>

            <div className="palette-tab-divider" />
            <div className="editor-section-label">注釈</div>
            <textarea
              ref={noteRef}
              className="explanation-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="状況設定に関する注釈を入力してください（未入力でも保存できます）"
              rows={2}
            />
            <div className="explanation-tile-palette">
              <span className="explanation-palette-label">牌を挿入：</span>
              {TILE_GROUPS.map(group => (
                <div key={group.label} className="palette-row">
                  <span className="palette-label">{group.label}</span>
                  <div className="palette-tiles">
                    {group.tiles.map(t => (
                      <TileImg key={t} tile={t} size={28} onClick={() => insertNoteTileCode(t)} className="palette-tile" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 他家捨て牌タブ */}
        {paletteTab === 'sutehai' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">家</div>
            <div className="situation-selector">
              <button
                className={`situation-btn situation-btn--unset${otherDiscardPlayer === null ? ' situation-btn--active' : ''}`}
                onClick={() => setOtherDiscardPlayer(null)}
              >
                未設定
              </button>
              {['東', '南', '西', '北'].map(wind => (
                <button
                  key={wind}
                  className={`situation-btn${otherDiscardPlayer === wind ? ' situation-btn--active' : ''}`}
                  onClick={() => setOtherDiscardPlayer(wind)}
                >
                  {wind}家
                </button>
              ))}
            </div>

            <div className="palette-tab-divider" />
            <div className="editor-section-label">
              捨て牌（クリックでリーチ宣言牌に設定/解除、×で削除）
            </div>
            <div className="other-discard-tiles-list">
              {otherDiscardTiles.map((t, i) => (
                <div
                  key={i}
                  className={`other-discard-tile-item${otherDiscardRiichiIndex === i ? ' other-discard-tile-item--riichi' : ''}`}
                >
                  <button className="other-discard-tile-remove" onClick={() => removeOtherDiscardTile(i)}>×</button>
                  <div
                    className="other-discard-tile-img-wrap"
                    onClick={() => toggleOtherDiscardRiichi(i)}
                    title={getTileLabel(t)}
                  >
                    <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                  </div>
                </div>
              ))}
              {otherDiscardTiles.length === 0 && <span className="editor-empty">牌を追加してください</span>}
            </div>

            <div className="palette-tab-divider" />
            {TILE_GROUPS.map(group => (
              <div key={group.label} className="palette-row">
                <span className="palette-label">{group.label}</span>
                <div className="palette-tiles">
                  {group.tiles.map(t => (
                    <TileImg key={t} tile={t} size={36} onClick={() => addOtherDiscardTile(t)} className="palette-tile" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 正解設定タブ */}
        {paletteTab === 'answer' && (
          <div className="palette-tab-content">
            {/* 通常（何切る） */}
            {problemType === 'default' && (
              <>
                <div className="editor-section-label">正解牌（手牌からクリックで選択）</div>
                <div className="editor-tiles">
                  {[...new Set(tiles)].map(t => (
                    <TileImg
                      key={t} tile={t}
                      onClick={() => setAnswer(t)}
                      className={`editor-tile ${answer === t ? 'tile--answer' : ''}`}
                    />
                  ))}
                </div>
                {(() => {
                  const counts = {}
                  tiles.forEach(t => { counts[t] = (counts[t] ?? 0) + 1 })
                  const quadTiles = Object.keys(counts).filter(t => counts[t] === 4)
                  if (quadTiles.length === 0) return null
                  return (
                    <div className="editor-ankan-options">
                      {quadTiles.map(t => (
                        <button
                          key={t}
                          className={`editor-ankan-btn${answer === `ankan:${t}` ? ' editor-ankan-btn--active' : ''}`}
                          onClick={() => setAnswer(`ankan:${t}`)}
                        >
                          カン
                          <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                        </button>
                      ))}
                    </div>
                  )
                })()}
                <div className="editor-current">
                  現在の正解: <strong>
                    {answer
                      ? answer.startsWith('ankan:')
                        ? `暗槓（${getTileLabel(answer.slice(6))}）`
                        : getTileLabel(answer)
                      : '未設定'}
                  </strong>
                </div>
                <div className="riichi-setting">
                  <span className="riichi-setting-label">リーチ：</span>
                  <button
                    className={`riichi-setting-btn ${riichi === true  ? 'riichi-setting-btn--active' : ''}`}
                    onClick={() => setRiichi(true)}
                  >する</button>
                  <button
                    className={`riichi-setting-btn ${riichi === false ? 'riichi-setting-btn--active' : ''}`}
                    onClick={() => setRiichi(false)}
                  >しない</button>
                  <button
                    className={`riichi-setting-btn ${riichi === null  ? 'riichi-setting-btn--active' : ''}`}
                    onClick={() => setRiichi(null)}
                  >設定なし</button>
                </div>
              </>
            )}

            {/* リーチ判断 */}
            {problemType === 'riichi-judgment' && (
              <>
                <div className="editor-section-label">正解（リーチ or ダマ）</div>
                <div className="problem-type-selector">
                  <button
                    className={`problem-type-btn${riichi === true  ? ' problem-type-btn--active' : ''}`}
                    onClick={() => setRiichi(true)}
                  >リーチ</button>
                  <button
                    className={`problem-type-btn${riichi === false ? ' problem-type-btn--active' : ''}`}
                    onClick={() => setRiichi(false)}
                  >ダマ</button>
                </div>
                <div className="editor-current">
                  現在の正解: <strong>{riichi === true ? 'リーチ' : riichi === false ? 'ダマ' : '未設定'}</strong>
                </div>
              </>
            )}

            {/* 鳴きタイミング */}
            {problemType === 'naki-timing' && (
              <>
                <div className="editor-section-label">
                  出た牌（他家の打牌）
                  {discardedTile && (
                    <button className="dora-clear" onClick={() => setDiscardedTile(null)}>クリア</button>
                  )}
                </div>
                <div className="editor-current">
                  現在の出牌: <strong>{discardedTile ? getTileLabel(discardedTile) : '未設定'}</strong>
                  {discardedTile && (
                    <img
                      src={getTileImageUrl(discardedTile)}
                      alt={getTileLabel(discardedTile)}
                      style={{ width: 32, verticalAlign: 'middle', marginLeft: 8 }}
                    />
                  )}
                </div>
                {TILE_GROUPS.map(group => (
                  <div key={group.label} className="palette-row">
                    <span className="palette-label">{group.label}</span>
                    <div className="palette-tiles">
                      {group.tiles.map(t => (
                        <TileImg
                          key={t} tile={t} size={36}
                          onClick={() => setDiscardedTile(t)}
                          className={`palette-tile ${discardedTile === t ? 'tile--answer' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="palette-tab-divider" />
                <div className="editor-section-label">正解タイミング</div>
                <div className="naki-timing-selector">
                  {NAKI_TIMING_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`naki-timing-btn${answer === opt.value ? ' naki-timing-btn--active' : ''}`}
                      onClick={() => setAnswer(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="editor-current">
                  現在の正解: <strong>{NAKI_TIMING_OPTIONS.find(o => o.value === answer)?.label ?? '未設定'}</strong>
                </div>
              </>
            )}

            {/* 鳴き選択 */}
            {problemType === 'naki-choice' && (
              <>
                <div className="editor-section-label">選択肢（何が出たら鳴くか）</div>
                {nakiChoices.length > 0 && (
                  <div className="naki-choices-list">
                    {nakiChoices.map((c, i) => (
                      <div key={i} className="naki-choice-item">
                        <TileImg tile={c.tile} size={32} onClick={() => {}} className="palette-tile" />
                        <span className="naki-choice-tile-name">{getTileLabel(c.tile)}</span>
                        <button
                          className={`naki-choice-correct-btn${c.correct ? ' naki-choice-correct-btn--on' : ''}`}
                          onClick={() => toggleNakiChoiceCorrect(i)}
                        >
                          {c.correct ? '正解' : '不正解'}
                        </button>
                        <button className="naki-choice-remove-btn" onClick={() => removeNakiChoice(i)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {nakiChoices.length === 0 && <span className="editor-empty">牌パレットから選択肢を追加してください</span>}
                <div className="editor-section-label" style={{ marginTop: 8 }}>牌パレット（クリックで選択肢に追加）</div>
                {TILE_GROUPS.map(group => (
                  <div key={group.label} className="palette-row">
                    <span className="palette-label">{group.label}</span>
                    <div className="palette-tiles">
                      {group.tiles.map(t => {
                        const added = nakiChoices.some(c => c.tile === t)
                        return (
                          <TileImg
                            key={t} tile={t} size={36}
                            onClick={() => addNakiChoice(t)}
                            className={`palette-tile${added ? ' palette-tile--disabled' : ''}`}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="palette-tab-divider" />
            <div className="editor-section-label">解説テキスト</div>
            <textarea
              ref={explanationRef}
              className="explanation-textarea"
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              placeholder="解説を入力してください（未入力でも保存できます）"
              rows={3}
            />
            <div className="explanation-tile-palette">
              <span className="explanation-palette-label">牌を挿入：</span>
              {TILE_GROUPS.map(group => (
                <div key={group.label} className="palette-row">
                  <span className="palette-label">{group.label}</span>
                  <div className="palette-tiles">
                    {group.tiles.map(t => (
                      <TileImg key={t} tile={t} size={28} onClick={() => insertTileCode(t)} className="palette-tile" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 保存ボタン */}
      <div className="editor-save-area">
        <button className="editor-save-btn" onClick={handleSave}>
          保存のみ
        </button>
        <button className="editor-save-next-btn" onClick={handleSaveAndNext} disabled={!hasNext}>
          保存して次へ → <kbd>Ctrl+S</kbd>
        </button>
      </div>
    </div>
  )
}
