import { useState, useEffect, useCallback, useRef } from 'react'
import { getTileImageUrl, getTileLabel, sortTiles } from '../utils/tileUtils'
import { normalizeProblemType } from '../utils/judgeUtils'
import { NAKI_TIMING_OPTIONS, MELD_TYPE_LABELS, MELD_TILE_COUNT, MELD_TYPES, getMeldTileRole } from '../utils/problemConstants'
import { questionImagePath, QUESTION_IMAGE_BUCKET } from '../utils/questionImage'
import QuestionImage from '../components/QuestionImage'
import { supabase } from '../lib/supabase'

const TILE_GROUPS = [
  { label: '萬子', tiles: ['1m','2m','3m','4m','5m','0m','6m','7m','8m','9m'] },
  { label: '筒子', tiles: ['1p','2p','3p','4p','5p','0p','6p','7p','8p','9p'] },
  { label: '索子', tiles: ['1s','2s','3s','4s','5s','0s','6s','7s','8s','9s'] },
  { label: '字牌', tiles: ['1z','2z','3z','4z','5z','6z','7z'] },
]

// 共通パレット（画面下部固定）の送り先モード
const PALETTE_MODE_LABELS = {
  hand:        '手牌',
  meld:        '副露',
  dora:        'ドラ',
  note:        '注釈に挿入',
  explanation: '解説に挿入',
  sutehai:     '捨て牌',
  depai:       '出牌',
  nakiChoice:  '選択肢',
}

const SCORE_WINDS    = ['東', '南', '西', '北']
const DEFAULT_SCORES = { 東: 25000, 南: 25000, 西: 25000, 北: 25000, kyotaku: 0 }

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
        const role = getMeldTileRole(type, i)
        if (role === 'back') return <div key={i} className="meld-preview-back" />
        return (
          <div key={i} className={`meld-preview-tile${role === 'rotated' ? ' meld-preview-tile--rotated tile-rotated' : ''}`}>
            <img src={getTileImageUrl(t)} alt={t} width={30} height={Math.round(30 * 60 / 44)} />
          </div>
        )
      })}
    </div>
  )
}

// 牌パレット（萬子/筒子/索子/字牌の4行）。tileClassName は牌ごとにクラスを変えたいとき関数で渡す
function TilePalette({ size = 36, onTileClick, tileClassName }) {
  return TILE_GROUPS.map(group => (
    <div key={group.label} className="palette-row">
      <span className="palette-label">{group.label}</span>
      <div className="palette-tiles">
        {group.tiles.map(t => (
          <TileImg
            key={t} tile={t} size={size}
            onClick={() => onTileClick(t)}
            className={tileClassName ? tileClassName(t) : 'palette-tile'}
          />
        ))}
      </div>
    </div>
  ))
}

// 風選択（未設定 + 東南西北など）。suffix はボタン表示の接尾辞（場/家）
function WindSelector({ value, onChange, winds, suffix = '' }) {
  return (
    <div className="situation-selector">
      <button
        className={`situation-btn situation-btn--unset${value === null ? ' situation-btn--active' : ''}`}
        onClick={() => onChange(null)}
      >
        未設定
      </button>
      {winds.map(wind => (
        <button
          key={wind}
          className={`situation-btn${value === wind ? ' situation-btn--active' : ''}`}
          onClick={() => onChange(wind)}
        >
          {wind}{suffix}
        </button>
      ))}
    </div>
  )
}

// 点数入力の1行（風ラベル + ±ステッパー + 直接入力）。
// 入力中は任意の数字を受け付け、確定（blur）時に100点単位へ丸める
function ScoreInputRow({ label, isSelf, value, onChange, steps }) {
  return (
    <div className="score-edit-row">
      <span className="score-edit-wind">
        {label}
        {isSelf && <span className="score-edit-self">自分</span>}
      </span>
      {steps.filter(s => s < 0).map(s => (
        <button key={s} className="score-step-btn" onClick={() => onChange(Math.max(0, value + s))}>
          −{-s}
        </button>
      ))}
      <input
        type="text"
        inputMode="numeric"
        className="score-edit-input"
        value={value}
        onFocus={e => e.target.select()}
        onChange={e => {
          const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
          onChange(Number.isNaN(n) ? 0 : n)
        }}
        onBlur={() => onChange(Math.max(0, Math.round(value / 100) * 100))}
      />
      {steps.filter(s => s > 0).map(s => (
        <button key={s} className="score-step-btn" onClick={() => onChange(value + s)}>
          +{s}
        </button>
      ))}
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
  // melds は未設定が null ではなく [] なので、?? ではなく件数で引き継ぎ判定する
  const [melds,         setMelds]         = useState(() => {
    const own = problem.melds ?? []
    return (own.length === 0 && inheritFromPrev) ? (prevProblem.melds ?? []) : own
  })
  const [explanation,   setExplanation]   = useState(problem.explanation ?? '')
  const [reviewed,      setReviewed]      = useState(problem.reviewed ?? false)
  const [disabled,      setDisabled]      = useState(problem.disabled ?? false)
  const [addingMeld,    setAddingMeld]    = useState(null)
  // 旧タイプ image-quiz は default に正規化する（画像は全タイプ共通の付加情報になった）
  const [problemType,   setProblemType]   = useState(normalizeProblemType(problem.problemType))
  const [discardedTile, setDiscardedTile] = useState(problem.discardedTile ?? null)
  const [nakiChoices,   setNakiChoices]   = useState(problem.nakiChoices   ?? [])
  const [tilesInput,       setTilesInput]       = useState('')
  const [questionImageUrl, setQuestionImageUrl] = useState(problem.questionImageUrl ?? null)
  const [imageUploading,   setImageUploading]   = useState(false)
  const [bakaze,           setBakaze]           = useState(problem.bakaze ?? (inheritFromPrev ? prevProblem.bakaze ?? null : null))
  const [kyoku,            setKyoku]            = useState(problem.kyoku  ?? (inheritFromPrev ? prevProblem.kyoku  ?? null : null))
  const [jikaze,           setJikaze]           = useState(problem.jikaze ?? (inheritFromPrev ? prevProblem.jikaze ?? null : null))
  const [junme,            setJunme]            = useState(problem.junme  ?? (inheritFromPrev ? prevProblem.junme  ?? null : null))
  const [scores,           setScores]           = useState(problem.scores ?? (inheritFromPrev ? prevProblem.scores ?? null : null))
  const [note,             setNote]             = useState(problem.note ?? '')
  const otherDiscardBase = problem.otherDiscard ?? (inheritFromPrev ? prevProblem.otherDiscard ?? null : null)
  const [otherDiscardPlayer,     setOtherDiscardPlayer]     = useState(otherDiscardBase?.player ?? null)
  const [otherDiscardTiles,      setOtherDiscardTiles]      = useState(otherDiscardBase?.tiles ?? [])
  const [otherDiscardRiichiIndex, setOtherDiscardRiichiIndex] = useState(otherDiscardBase?.riichiIndex ?? null)
  // 捨て牌のドラッグ＆ドロップ並べ替え（drag=掴んでいる牌のindex、drop=挿入位置0〜length。移動にならない位置はnull）
  const [sutehaiDragIndex, setSutehaiDragIndex] = useState(null)
  const [sutehaiDropIndex, setSutehaiDropIndex] = useState(null)

  const explanationRef = useRef(null)
  const noteRef        = useRef(null)
  // 修正済みチェックをこの編集画面で手動操作したか。
  // 手動操作があれば「保存して次へ」の自動チェックよりそちらを尊重する
  const reviewedTouchedRef = useRef(false)
  // 一度もフォーカスしていない textarea は selectionStart が 0 のため、
  // カーソル位置ではなく末尾に挿入する（フォーカス済みかをここで覚える）
  const explanationTouchedRef = useRef(false)
  const noteTouchedRef        = useRef(false)

  async function handleImageUpload(file) {
    if (!file) return
    setImageUploading(true)
    const ext = file.name.split('.').pop()
    const filename = `${problem.id}.${ext}`
    const { error } = await supabase.storage.from(QUESTION_IMAGE_BUCKET).upload(filename, file, { upsert: true })
    if (error) {
      alert(`アップロード失敗: ${error.message}`)
      setImageUploading(false)
      return
    }
    // バケットは限定公開のため公開URLではなくファイル名を保存し、表示時に署名付きURLを発行する
    setQuestionImageUrl(filename)
    setImageUploading(false)
  }

  async function handleImageDelete() {
    if (!window.confirm('画像をStorageからも削除します。よろしいですか？\n（削除後は「保存」で問題からの参照も消してください）')) return
    const path = questionImagePath(questionImageUrl)
    if (path) {
      const { error } = await supabase.storage.from(QUESTION_IMAGE_BUCKET).remove([path])
      if (error) {
        alert(`Storage上の削除に失敗: ${error.message}`)
        return
      }
    }
    setQuestionImageUrl(null)
  }

  // textarea のカーソル位置（未フォーカスなら末尾）に牌コードを挿入する共通処理
  function insertAtCursor(ta, touched, value, setValue, tile) {
    if (!ta) return
    const start = touched ? ta.selectionStart : value.length
    const end   = touched ? ta.selectionEnd   : value.length
    const code  = `[${tile}]`
    setValue(value.slice(0, start) + code + value.slice(end))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + code.length, start + code.length)
    })
  }

  function insertTileCode(tile) {
    insertAtCursor(explanationRef.current, explanationTouchedRef.current, explanation, setExplanation, tile)
  }

  function insertNoteTileCode(tile) {
    insertAtCursor(noteRef.current, noteTouchedRef.current, note, setNote, tile)
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
    // 手牌を編集し始めたので、パレットからの追加先も手牌に合わせる
    setPaletteMode('hand')
  }

  function startAddMeld(type) { setAddingMeld({ type, tiles: [] }) }

  function addTileToMeld(tile) {
    if (!addingMeld) return
    const maxCount = MELD_TILE_COUNT[addingMeld.type]
    if (addingMeld.tiles.length >= maxCount) return
    // ポン・カン系は同一牌で構成されるため、1枚選んだら全スロットを一括で埋める。
    // 赤5は1枚しか存在しないので、赤5(0x)を選んだ場合は残りを通常の5で埋める
    const nextTiles = addingMeld.type === 'chi'
      ? [...addingMeld.tiles, tile]
      : [tile, ...Array(maxCount - 1).fill(tile[0] === '0' ? `5${tile[1]}` : tile)]
    if (nextTiles.length === maxCount) {
      // 枚数が揃った時点で自動確定（確定ボタンは無い）
      setMelds(prev => [...prev, { type: addingMeld.type, tiles: nextTiles }])
      setAddingMeld(null)
    } else {
      setAddingMeld({ ...addingMeld, tiles: nextTiles })
    }
  }

  function removeTileFromMeld(index) {
    setAddingMeld(prev => prev ? { ...prev, tiles: prev.tiles.filter((_, i) => i !== index) } : null)
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

  function moveOtherDiscardTile(from, insertAt) {
    // insertAt は移動前の配列基準の挿入位置（0〜length）。from を取り除いた後の位置に補正する
    const to = insertAt > from ? insertAt - 1 : insertAt
    if (from === to) return
    setOtherDiscardTiles(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    // リーチ宣言牌の位置を並べ替えに追従させる
    setOtherDiscardRiichiIndex(prev => {
      if (prev === null) return null
      if (prev === from) return to
      const idx = prev > from ? prev - 1 : prev
      return idx >= to ? idx + 1 : idx
    })
  }

  // ドラッグ中の挿入位置を更新する。移動しても並びが変わらない位置（自分の前後）はインジケーターを出さない
  function updateSutehaiDropIndex(pos) {
    setSutehaiDropIndex(pos === sutehaiDragIndex || pos === sutehaiDragIndex + 1 ? null : pos)
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
    kyoku,
    jikaze,
    junme,
    scores,
    note,
    // アプリ側（OtherDiscardDisplay）は家と牌の両方が揃わないと表示しないため、
    // 片方だけの不完全な設定は保存せず null にする（画面には警告を出す）。
    // 家が自風（＝自分）の設定も明らかな誤りなので同様に保存しない
    otherDiscard: (otherDiscardPlayer && otherDiscardTiles.length > 0 && otherDiscardPlayer !== jikaze)
      ? { player: otherDiscardPlayer, tiles: otherDiscardTiles, riichiIndex: otherDiscardRiichiIndex }
      : null,
  }), [problem, tiles, answer, dora, riichi, melds, explanation, reviewed, disabled, problemType, discardedTile, nakiChoices, questionImageUrl, bakaze, kyoku, jikaze, junme, scores, note, otherDiscardPlayer, otherDiscardTiles, otherDiscardRiichiIndex])

  const otherDiscardIncomplete =
    (otherDiscardPlayer !== null && otherDiscardTiles.length === 0) ||
    (otherDiscardPlayer === null && otherDiscardTiles.length > 0)
  // 家が自風（＝自分）と同じ設定は誤りなので警告し、保存もスキップする（buildSaveData 側で null 化）
  const otherDiscardSelfPlayer =
    otherDiscardPlayer !== null && otherDiscardPlayer === jikaze
  // リーチ宣言牌の設定漏れは警告のみ（リーチしていない他家の捨て牌もあり得るため保存はされる）
  const otherDiscardRiichiMissing =
    otherDiscardPlayer !== null && otherDiscardTiles.length > 0 && otherDiscardRiichiIndex === null

  const handleSave = useCallback(() => {
    onSave(buildSaveData())
  }, [onSave, buildSaveData])

  const handleSaveAndNext = useCallback(() => {
    // 「保存して次へ」は修正完了とみなして自動で修正済みにする。
    // ただしチェックボックスを手動操作した場合はその状態をそのまま保存する
    const effectiveReviewed = reviewedTouchedRef.current ? reviewed : true
    onSaveAndNext({ ...buildSaveData(), reviewed: effectiveReviewed })
  }, [onSaveAndNext, buildSaveData, reviewed])

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

  const [paletteTab,  setPaletteTab]  = useState('hand')
  const [paletteMode, setPaletteMode] = useState('hand')

  // 共通パレットの送り先モード。タブや問題タイプに依存するモードは文脈があるときだけ出す。
  // 副露追加中は「副露」に固定（setState不要にするため、実効モードは描画時に導出する）
  const availableModes = [
    'hand',
    ...(addingMeld ? ['meld'] : []),
    'dora',
    'note',
    'explanation',
    ...(paletteTab === 'sutehai' ? ['sutehai'] : []),
    ...(paletteTab === 'answer' && problemType === 'naki-timing' ? ['depai'] : []),
    ...(paletteTab === 'answer' && problemType === 'naki-choice' ? ['nakiChoice'] : []),
  ]
  const effectiveMode = addingMeld
    ? 'meld'
    : (availableModes.includes(paletteMode) ? paletteMode : 'hand')

  function handlePaletteTile(tile) {
    switch (effectiveMode) {
      case 'hand':        addTile(tile); break
      case 'meld':        addTileToMeld(tile); break
      case 'dora':        setDora(tile); break
      case 'note':        insertNoteTileCode(tile); break
      case 'explanation': insertTileCode(tile); break
      case 'sutehai':     addOtherDiscardTile(tile); break
      case 'depai':       setDiscardedTile(tile); break
      case 'nakiChoice':  addNakiChoice(tile); break
    }
  }

  const paletteStatus = {
    hand:        `手牌: ${tiles.length}枚`,
    meld:        addingMeld ? `${MELD_TYPE_LABELS[addingMeld.type]}: ${addingMeld.tiles.length} / ${MELD_TILE_COUNT[addingMeld.type]}枚` : '',
    dora:        `ドラ: ${dora ? getTileLabel(dora) : 'なし'}`,
    note:        '注釈のカーソル位置に挿入',
    explanation: '解説のカーソル位置に挿入',
    sutehai:     `${otherDiscardPlayer ? `${otherDiscardPlayer}家` : ''}捨て牌: ${otherDiscardTiles.length}枚`,
    depai:       `出牌: ${discardedTile ? getTileLabel(discardedTile) : '未設定'}`,
    nakiChoice:  `選択肢: ${nakiChoices.length}件`,
  }[effectiveMode]

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
            onChange={e => { reviewedTouchedRef.current = true; setReviewed(e.target.checked) }}
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

      {/* 問題画像：Supabase Storageアップロード（全タイプ共通・限定公開バケット） */}
      <section className="editor-section">
        <div className="editor-section-label">問題画像（任意）</div>
        <QuestionImage value={questionImageUrl} wrapClassName="editor-image-wrap" imgClassName="editor-image" />
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
            <button className="dora-clear" onClick={handleImageDelete}>画像を削除</button>
          )}
        </div>
        {questionImageUrl && (
          <div className="editor-current" style={{ wordBreak: 'break-all', fontSize: 11 }}>
            ファイル: {questionImagePath(questionImageUrl)}
          </div>
        )}
      </section>

      {/* 参照用画像（scan-tilesで生成した問題のみ） */}
      {problem.image && (
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
                  <span className="editor-meld-inline-label">{MELD_TYPE_LABELS[meld.type]}</span>
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
      </section>

      {/* === パレット統合エリア === */}
      <section className="editor-section editor-section--palette">
        <div className="palette-tab-bar">
          <button
            className={`palette-tab-btn${paletteTab === 'hand' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => { setPaletteTab('hand'); setPaletteMode('hand') }}
          >
            手牌
          </button>
          <button
            className={`palette-tab-btn${paletteTab === 'jokyo' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => { setPaletteTab('jokyo'); setPaletteMode('dora') }}
          >
            状況設定
          </button>
          <button
            className={`palette-tab-btn${paletteTab === 'sutehai' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => { setPaletteTab('sutehai'); setPaletteMode('sutehai') }}
          >
            他家捨て牌
          </button>
          <button
            className={`palette-tab-btn${paletteTab === 'answer' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => {
              setPaletteTab('answer')
              if (problemType === 'naki-timing')      setPaletteMode('depai')
              else if (problemType === 'naki-choice') setPaletteMode('nakiChoice')
              else                                    setPaletteMode('explanation')
            }}
          >
            正解設定
          </button>
        </div>

        {/* 手牌タブ */}
        {paletteTab === 'hand' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">テキスト一括入力</div>
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

            <div className="palette-tab-divider" />
            <div className="editor-section-label">副露（鳴き）</div>
            {addingMeld ? (
              <div className="meld-adding">
                <div className="meld-adding-header">
                  <span className="meld-adding-title">
                    {MELD_TYPE_LABELS[addingMeld.type]}：下のパレットから牌を選択（揃うと自動で追加）
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
              </div>
            ) : (
              <div className="meld-add-btns">
                {MELD_TYPES.map(type => (
                  <button key={type} className="meld-add-btn" onClick={() => startAddMeld(type)}>
                    {MELD_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 状況設定タブ */}
        {paletteTab === 'jokyo' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">ドラ</div>
            <div className="palette-tab-status">
              現在のドラ: <strong>{dora ? getTileLabel(dora) : 'なし'}</strong>
              {dora && <img src={getTileImageUrl(dora)} alt={getTileLabel(dora)} className="palette-tab-status-tile" />}
              <button className="dora-clear" onClick={() => setDora(null)}>なし</button>
              <button className="palette-mode-jump" onClick={() => setPaletteMode('dora')}>下のパレットで選ぶ ↓</button>
            </div>

            <div className="palette-tab-divider" />
            <div className="editor-section-label">場風</div>
            <WindSelector value={bakaze} onChange={setBakaze} winds={['東', '南', '西']} suffix="場" />

            <div className="palette-tab-divider" />
            <div className="editor-section-label">局（場風とセットで「南1局」のように表示されます）</div>
            <div className="situation-selector">
              <button
                className={`situation-btn situation-btn--unset${kyoku === null ? ' situation-btn--active' : ''}`}
                onClick={() => setKyoku(null)}
              >
                未設定
              </button>
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  className={`situation-btn${kyoku === n ? ' situation-btn--active' : ''}`}
                  onClick={() => setKyoku(n)}
                >
                  {n}局
                </button>
              ))}
            </div>

            <div className="palette-tab-divider" />
            <div className="editor-section-label">自風</div>
            <WindSelector value={jikaze} onChange={setJikaze} winds={['東', '南', '西', '北']} />

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
            <div className="editor-section-label">点数状況</div>
            <div className="situation-selector">
              <button
                className={`situation-btn situation-btn--unset${scores === null ? ' situation-btn--active' : ''}`}
                onClick={() => setScores(null)}
              >
                未設定
              </button>
              <button
                className={`situation-btn${scores !== null ? ' situation-btn--active' : ''}`}
                onClick={() => setScores(prev => prev ?? { ...DEFAULT_SCORES })}
              >
                設定する
              </button>
            </div>
            {scores !== null && (() => {
              const total = SCORE_WINDS.reduce((sum, w) => sum + (scores[w] ?? 0), 0) + (scores.kyotaku ?? 0)
              const totalOk = total === 100000
              return (
                <div className="score-edit-area">
                  {SCORE_WINDS.map(w => (
                    <ScoreInputRow
                      key={w}
                      label={`${w}家`}
                      isSelf={jikaze === w}
                      value={scores[w] ?? 0}
                      onChange={v => setScores(prev => ({ ...prev, [w]: v }))}
                      steps={[-10000, -1000, -100, 100, 1000, 10000]}
                    />
                  ))}
                  <ScoreInputRow
                    label="供託"
                    isSelf={false}
                    value={scores.kyotaku ?? 0}
                    onChange={v => setScores(prev => ({ ...prev, kyotaku: v }))}
                    steps={[-1000, 1000]}
                  />
                  <div className="score-edit-footer">
                    <span className={`score-edit-total${totalOk ? '' : ' score-edit-total--warn'}`}>
                      {totalOk
                        ? `合計 ${total.toLocaleString()}点（供託込み） ✓`
                        : `⚠ 合計 ${total.toLocaleString()}点（供託込み）— 100,000点になっていません`}
                    </span>
                    <button className="dora-clear" onClick={() => setScores({ ...DEFAULT_SCORES })}>
                      全員25000に戻す
                    </button>
                  </div>
                </div>
              )
            })()}

            <div className="palette-tab-divider" />
            <div className="editor-section-label">注釈</div>
            <textarea
              ref={noteRef}
              className="explanation-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              onFocus={() => { noteTouchedRef.current = true; setPaletteMode('note') }}
              placeholder="状況設定に関する注釈を入力してください（牌は下のパレットからカーソル位置に挿入できます）"
              rows={2}
            />
          </div>
        )}

        {/* 他家捨て牌タブ */}
        {paletteTab === 'sutehai' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">家</div>
            <WindSelector value={otherDiscardPlayer} onChange={setOtherDiscardPlayer} winds={['東', '南', '西', '北']} suffix="家" />

            <div className="palette-tab-divider" />
            <div className="editor-section-label">
              捨て牌（クリックでリーチ宣言牌に設定/解除、×で削除）
              {otherDiscardTiles.length > 0 && (
                <button
                  className="dora-clear"
                  onClick={() => { setOtherDiscardTiles([]); setOtherDiscardRiichiIndex(null) }}
                >
                  全削除
                </button>
              )}
            </div>
            <div
              className="other-discard-tiles-list"
              onDragOver={e => {
                // 牌の隙間・末尾の空き領域では末尾への挿入とみなす（牌上は各アイテム側で処理）
                if (sutehaiDragIndex === null) return
                e.preventDefault()
                updateSutehaiDropIndex(otherDiscardTiles.length)
              }}
              onDrop={e => {
                e.preventDefault()
                if (sutehaiDragIndex !== null && sutehaiDropIndex !== null) {
                  moveOtherDiscardTile(sutehaiDragIndex, sutehaiDropIndex)
                }
                setSutehaiDragIndex(null)
                setSutehaiDropIndex(null)
              }}
            >
              {otherDiscardTiles.map((t, i) => (
                <div
                  key={i}
                  className={
                    `other-discard-tile-item${otherDiscardRiichiIndex === i ? ' other-discard-tile-item--riichi' : ''}` +
                    `${sutehaiDragIndex === i ? ' other-discard-tile-item--dragging' : ''}` +
                    `${sutehaiDropIndex === i ? ' other-discard-tile-item--drop-before' : ''}` +
                    `${sutehaiDropIndex === i + 1 && i === otherDiscardTiles.length - 1 ? ' other-discard-tile-item--drop-after' : ''}`
                  }
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', '') // Firefoxはこれが無いとドラッグが始まらない
                    setSutehaiDragIndex(i)
                  }}
                  onDragEnd={() => { setSutehaiDragIndex(null); setSutehaiDropIndex(null) }}
                  onDragOver={e => {
                    if (sutehaiDragIndex === null) return
                    e.preventDefault()
                    e.stopPropagation()
                    // カーソルが牌の左半分なら前、右半分なら後ろに挿入
                    const rect = e.currentTarget.getBoundingClientRect()
                    updateSutehaiDropIndex(e.clientX < rect.left + rect.width / 2 ? i : i + 1)
                  }}
                >
                  <button className="other-discard-tile-remove" onClick={() => removeOtherDiscardTile(i)}>×</button>
                  <div
                    className={`other-discard-tile-img-wrap${otherDiscardRiichiIndex === i ? ' tile-rotated' : ''}`}
                    onClick={() => toggleOtherDiscardRiichi(i)}
                    title={getTileLabel(t)}
                  >
                    <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                  </div>
                </div>
              ))}
              {otherDiscardTiles.length === 0 && <span className="editor-empty">牌を追加してください</span>}
            </div>
            {otherDiscardIncomplete && (
              <div className="other-discard-warning">
                ⚠ 家と捨て牌の両方を設定してください。片方だけの設定は保存されません。
              </div>
            )}
            {otherDiscardSelfPlayer && (
              <div className="other-discard-warning">
                ⚠ 家が状況設定の自風（{jikaze}家＝自分）と同じです。この設定は保存されません。
              </div>
            )}
            {otherDiscardRiichiMissing && (
              <div className="other-discard-warning">
                ⚠ リーチ宣言牌が設定されていません。捨て牌をクリックして指定してください。
              </div>
            )}
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
                {nakiChoices.length === 0 && <span className="editor-empty">下のパレットから選択肢を追加してください</span>}
              </>
            )}

            <div className="palette-tab-divider" />
            <div className="editor-section-label">解説テキスト</div>
            <textarea
              ref={explanationRef}
              className="explanation-textarea"
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              onFocus={() => { explanationTouchedRef.current = true; setPaletteMode('explanation') }}
              placeholder="解説を入力してください（牌は下のパレットからカーソル位置に挿入できます）"
              rows={3}
            />
          </div>
        )}
      </section>

      {/* 保存ボタン */}
      <div className="editor-save-area">
        {otherDiscardIncomplete && (
          <span className="editor-save-warning">
            ⚠ 他家捨て牌が未完成（家と牌の両方が必要）のため保存されません
          </span>
        )}
        {otherDiscardSelfPlayer && (
          <span className="editor-save-warning">
            ⚠ 他家捨て牌の家が自風と同じため保存されません
          </span>
        )}
        {otherDiscardRiichiMissing && (
          <span className="editor-save-warning">
            ⚠ リーチ宣言牌が未設定です
          </span>
        )}
        <button className="editor-save-btn" onClick={handleSave}>
          保存のみ
        </button>
        <button className="editor-save-next-btn" onClick={handleSaveAndNext} disabled={!hasNext}>
          保存して次へ → <kbd>Ctrl+S</kbd>
        </button>
      </div>

      {/* 共通牌パレット（画面下部固定）。送り先モードで牌の追加先を切り替える */}
      <div className="palette-dock">
        <div className="palette-dock-header">
          <div className="palette-dock-modes">
            <span className="palette-dock-modes-label">送り先:</span>
            {availableModes.map(m => (
              <button
                key={m}
                className={`palette-mode-btn${effectiveMode === m ? ' palette-mode-btn--active' : ''}`}
                onClick={() => setPaletteMode(m)}
                disabled={!!addingMeld && m !== 'meld'}
              >
                {PALETTE_MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <span className="palette-dock-status">{paletteStatus}</span>
        </div>
        <TilePalette size={32} onTileClick={handlePaletteTile} />
      </div>
    </div>
  )
}
