import { useState, useEffect, useCallback, useRef } from 'react'
import { getTileImageUrl, getTileLabel, sortTiles } from '../utils/tileUtils'
import { normalizeProblemType, parseAnswers } from '../utils/judgeUtils'
import {
  NAKI_TIMING_OPTIONS, MELD_TYPE_LABELS, MELD_TILE_COUNT, MELD_TYPES, getMeldTileRole,
  getMeldFromOptions, normalizeMelds, PROBLEM_TYPE_LABELS,
} from '../utils/problemConstants'
import { parseTileNotation } from '../utils/importBoard'

import BoardView from './BoardView'

// 副露を新規作成するときの鳴いた元（チーは上家固定・暗槓は無し）
function defaultMeldFrom(type) {
  return getMeldFromOptions(type)[0] ?? null
}
import { questionImagePath, QUESTION_IMAGE_BUCKET } from '../utils/questionImage'
import { useDragReorder } from '../utils/useDragReorder'
import QuestionImage from '../components/QuestionImage'
import ShareButton from '../components/ShareButton'
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
  const { type, tiles, from } = meld
  return (
    <div className="meld-preview">
      {tiles.map((t, i) => {
        const role = getMeldTileRole(type, i, from)
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

// 副露の「鳴いた元」セレクタ。
// 暗槓（選択肢なし）は何も描画せず、チー（上家のみ）はセレクタではなく固定表示にする
function MeldFromSelect({ type, value, onChange }) {
  const options = getMeldFromOptions(type)
  // 選べる鳴いた元が無い（暗槓）／1つしかない（チー＝上家から固定）ときは何も出さない。
  // 選択肢が無いものを表示しても場所を取るだけなので、値の補完は normalizeMeld に任せる
  if (options.length <= 1) return null
  return (
    <select
      className="meld-from-select"
      value={options.includes(value) ? value : options[0]}
      onChange={e => onChange(e.target.value)}
      title="鳴いた元"
      onClick={e => e.stopPropagation()}
    >
      {options.map(f => <option key={f} value={f}>{f}から</option>)}
    </select>
  )
}

// 副露入力中パネル（手牌・他家捨て牌の家ブロックで共用）。牌は下のパレットから追加し、揃うと自動確定する
function MeldAddingPanel({ meld, onCancel, onRemoveTile, onChangeFrom }) {
  return (
    <div className="meld-adding">
      <div className="meld-adding-header">
        <span className="meld-adding-title">
          {MELD_TYPE_LABELS[meld.type]}：下のパレットから牌を選択（揃うと自動で追加）
          （{meld.tiles.length} / {MELD_TILE_COUNT[meld.type]}枚）
        </span>
        <MeldFromSelect type={meld.type} value={meld.from} onChange={onChangeFrom} />
        <button className="meld-cancel-btn" onClick={onCancel}>キャンセル</button>
      </div>
      <div className="meld-selected-tiles">
        {meld.tiles.map((t, i) => (
          <TileImg key={i} tile={t} size={36} onClick={() => onRemoveTile(i)} className="editor-tile" />
        ))}
        {Array.from({ length: MELD_TILE_COUNT[meld.type] - meld.tiles.length }).map((_, i) => (
          <div key={`empty-${i}`} className="meld-tile-slot" />
        ))}
      </div>
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

// 風選択（未設定 + 東南西北など）。suffix はボタン表示の接尾辞（場/家）。
// selfWind を渡すと、その風のボタンに「（自家）」を付けて自分の家だと分かるようにする
function WindSelector({ value, onChange, winds, suffix = '', selfWind = null }) {
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
          {wind}{suffix}{selfWind && wind === selfWind ? '（自家）' : ''}
        </button>
      ))}
    </div>
  )
}

// 点数入力の1組。右カラムの幅では「家名 + ±ステッパー + 入力」が1行に収まらないため、
// 家名を1行目・操作を2行目に分ける（折り返すと行の対応が読み取れなくなるため）。
// 入力中は任意の数字を受け付け、確定（blur）時に100点単位へ丸める
function ScoreInputRow({ label, isSelf, active, value, onChange, steps }) {
  return (
    <div
      className={
        'score-edit-row' +
        (isSelf ? ' score-edit-row--self' : '') +
        (active ? ' score-edit-row--active' : '')
      }
    >
      <div className="score-edit-wind">
        {label}
        {isSelf && <span className="score-edit-self">自分</span>}
      </div>
      <div className="score-edit-controls">
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
    </div>
  )
}

// 入力欄の残数表示（textLimits を渡したときだけ出る）
function TextCount({ len, max }) {
  return (
    <span className={`editor-text-count${len >= max ? ' editor-text-count--full' : ''}`}>
      {len} / {max}
    </span>
  )
}

// hideImage / hideReviewed / hideDelete / headerLead は自作問題の作成画面（MyProblemsApp）用の
// オプション。既定値はすべて現行の管理画面の挙動なので、AdminApp 側は無変更で動く。
//   hideImage    … user_problems の画像はバケットの整理が済むまで使わないため隠す
//   hideReviewed … 「修正済み」は公式問題の校正用フラグで user_problems に列が無い
//   hideDelete   … 削除は一覧側に集約する（id が uuid だと確認メッセージが不自然になるため）
//   headerLead   … ヘッダー先頭の「ID 123」を差し替える（uuid をそのまま出すと場所を食う）
//   saveStatus   … 保存ボタンの隣に出す状態表示（ReactNode 可）。
//                  サイドバーに出すと保存ボタンから遠く、保存できたか分かりにくいため
//   lockBoard    … 盤面（手牌・状況設定・捨て牌）を編集できないようにする。
//                  牌譜から作った問題は「実在の局面をそのまま出題する」のが基本なので既定でロックし、
//                  ヘッダーのトグルで解除する。ロック中はパレットのタブが「正解設定」だけになり、
//                  注釈はそのタブに出る（手牌タブが隠れて編集できなくなるのを防ぐため）
//   concealedCounts … 他家の手牌の実際の枚数。BoardView へそのまま渡す（表示専用・保存されない）
//   hideDisabled … 「非表示」チェックを隠す（自作問題は自分しか見ないので使い道がない）
//   paletteAside … 牌パレットの右の余白に出す内容（操作ガイド等）。渡さなければ牌だけが並ぶ
//   textLimits   … { explanation, note } の文字数上限。入力欄に maxLength と残数表示を付ける。
//                  自作問題は DB 側の CHECK 制約で 200字までなので、書いてから保存で弾かれるのを防ぐ。
//                  公式問題に上限は無いので既定は null（管理画面の挙動は変わらない）
export default function ProblemEditor({
  problem, prevProblem, onSave, onSaveAndNext, onDelete, hasNext,
  hideImage = false, hideReviewed = false, hideDelete = false, headerLead = null,
  saveStatus = null, lockBoard = false, concealedCounts = null,
  hideDisabled = false, paletteAside = null, textLimits = null, hideBoardView = false,
  onShare = null,
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
  // ドラは「なし」を許さない。自分の値 → 前の問題からの引き継ぎ → 北(4z) の順で初期化する
  const [dora,          setDora]          = useState(problem.dora ?? (inheritFromPrev ? prevProblem.dora ?? null : null) ?? '4z')
  const [riichi,        setRiichi]        = useState(problem.riichi ?? (inheritFromPrev ? prevProblem.riichi ?? null : null))
  // melds は未設定が null ではなく [] なので、?? ではなく件数で引き継ぎ判定する
  const [melds,         setMelds]         = useState(() => {
    const own = problem.melds ?? []
    // 引き継ぎ元が fromDb を通っていない可能性に備え、鳴いた元をここでも補完する
    return normalizeMelds((own.length === 0 && inheritFromPrev) ? (prevProblem.melds ?? []) : own)
  })
  const [explanation,   setExplanation]   = useState(problem.explanation ?? '')
  const [reviewed,      setReviewed]      = useState(problem.reviewed ?? false)
  const [disabled,      setDisabled]      = useState(problem.disabled ?? false)
  // 出題画面を麻雀卓の形にするか（公式問題のみ。自作問題は常に盤面なので設定を出さない）
  const [boardView,     setBoardView]     = useState(problem.boardView ?? false)
  const [addingMeld,    setAddingMeld]    = useState(null)
  // 旧タイプ image-quiz は default に正規化する（画像は全タイプ共通の付加情報になった）
  const [problemType,   setProblemType]   = useState(normalizeProblemType(problem.problemType))
  const [discardedTile, setDiscardedTile] = useState(problem.discardedTile ?? null)
  const [nakiChoices,   setNakiChoices]   = useState(problem.nakiChoices   ?? [])
  const [tilesInput,       setTilesInput]       = useState('')
  const [questionImageUrl, setQuestionImageUrl] = useState(problem.questionImageUrl ?? null)
  const [imageUploading,   setImageUploading]   = useState(false)
  // 問題画像の入力欄は既定で畳んでおく（大半の問題は画像なし。縦の場所を空けるため）
  const [imageOpen,        setImageOpen]        = useState(false)
  // 状況設定は「自分の値 → 前の問題からの引き継ぎ → 既定値」の順で初期化する。
  // ドラ（北）と同じ考え方で、未設定のまま出題されるのを防ぐ（既定値は東1局・南家・9巡目・全員25000点）
  const [bakaze,           setBakaze]           = useState(problem.bakaze ?? (inheritFromPrev ? prevProblem.bakaze ?? null : null) ?? '東')
  const [kyoku,            setKyoku]            = useState(problem.kyoku  ?? (inheritFromPrev ? prevProblem.kyoku  ?? null : null) ?? 1)
  const [honba,            setHonba]            = useState(problem.honba  ?? (inheritFromPrev ? prevProblem.honba  ?? null : null) ?? 0)
  const [jikaze,           setJikaze]           = useState(problem.jikaze ?? (inheritFromPrev ? prevProblem.jikaze ?? null : null) ?? '南')
  const [junme,            setJunme]            = useState(problem.junme  ?? (inheritFromPrev ? prevProblem.junme  ?? null : null) ?? 9)
  const [scores,           setScores]           = useState(problem.scores ?? (inheritFromPrev ? prevProblem.scores ?? null : null) ?? { ...DEFAULT_SCORES })
  const [note,             setNote]             = useState(problem.note ?? '')
  // 他家捨て牌は最大3人分の配列。各要素は {player, tiles, riichiIndex, melds}（編集中は不完全な要素も許容し、保存時に除外する）
  const otherDiscardsBase = problem.otherDiscards ?? (inheritFromPrev ? prevProblem.otherDiscards ?? null : null)
  const [otherDiscards, setOtherDiscards] = useState(() => {
    const base = (otherDiscardsBase ?? []).map(od => ({
      player:      od?.player ?? null,
      tiles:       od?.tiles ?? [],
      riichiIndex: od?.riichiIndex ?? null,
      melds:       normalizeMelds(od?.melds), // 旧データには無いフィールドなのでここで補う（鳴いた元も補完）
    }))
    // データが無くても1人目の空ブロックを出しておく（未設定のままなら保存時に除外されて null になる）
    return base.length > 0 ? base : [{ player: null, tiles: [], riichiIndex: null, melds: [] }]
  })
  // 盤面の点数チップからどの家をクリックしたか（点数タブでその家の行をハイライトする）
  const [activeScoreWind, setActiveScoreWind] = useState(null)
  // パレットからの牌追加先ブロック（ブロック削除でずれるため描画時に clamp する）
  const [sutehaiActiveIdx, setSutehaiActiveIdx] = useState(0)
  const activeSutehaiIdx = Math.min(sutehaiActiveIdx, otherDiscards.length - 1) // ブロックが無ければ -1
  // 捨て牌のドラッグ＆ドロップ並べ替え（drag={block, index}、drop=同ブロック内の挿入位置0〜length。移動にならない位置はnull）
  const [sutehaiDrag,      setSutehaiDrag]      = useState(null)
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
      // 手牌から消えた牌は正解リストからも外す（複数正解のうち該当分だけ）
      if (!next.includes(removed)) {
        setAnswer(a => parseAnswers(a).filter(tok => tok !== removed).join(','))
      }
      return next
    })
    // 手牌を編集し始めたので、パレットからの追加先も手牌に合わせる
    setPaletteMode('hand')
  }

  // 正解はカンマ区切りで複数持てる。クリックで追加/解除をトグルする
  function toggleAnswer(token) {
    setAnswer(prev => {
      const list = parseAnswers(prev)
      const next = list.includes(token) ? list.filter(a => a !== token) : [...list, token]
      return next.join(',')
    })
  }

  // 副露追加は手牌と他家捨て牌の家ブロックで共用する。target は 'hand' または家ブロックの index。
  // from（鳴いた元）は暗槓のみ null、それ以外は既定値から始めて追加中に変更できる
  function startAddMeld(type) {
    setAddingMeld({ type, tiles: [], target: 'hand', from: defaultMeldFrom(type) })
  }

  function startAddOtherDiscardMeld(blockIdx, type) {
    setSutehaiActiveIdx(blockIdx)
    setAddingMeld({ type, tiles: [], target: blockIdx, from: defaultMeldFrom(type) })
  }

  function changeAddingMeldFrom(from) {
    setAddingMeld(prev => prev ? { ...prev, from } : null)
  }

  function updateMeldFrom(index, from) {
    setMelds(prev => prev.map((m, i) => i === index ? { ...m, from } : m))
  }

  function updateOtherDiscardMeldFrom(blockIdx, meldIdx, from) {
    updateOtherDiscard(blockIdx, od => ({
      ...od,
      melds: od.melds.map((m, i) => i === meldIdx ? { ...m, from } : m),
    }))
  }

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
      const meld = { type: addingMeld.type, tiles: nextTiles, from: addingMeld.from ?? null }
      if (addingMeld.target === 'hand') {
        setMelds(prev => [...prev, meld])
      } else {
        updateOtherDiscard(addingMeld.target, od => ({ ...od, melds: [...od.melds, meld] }))
      }
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

  function removeOtherDiscardMeld(blockIdx, meldIdx) {
    updateOtherDiscard(blockIdx, od => ({ ...od, melds: od.melds.filter((_, i) => i !== meldIdx) }))
  }

  function updateOtherDiscard(blockIdx, updater) {
    setOtherDiscards(prev => prev.map((od, i) => i === blockIdx ? updater(od) : od))
  }

  function addOtherDiscardBlock() {
    if (otherDiscards.length >= 4) return // 自分を含めて4人ぶん
    setOtherDiscards(prev => [...prev, { player: null, tiles: [], riichiIndex: null, melds: [] }])
    setSutehaiActiveIdx(otherDiscards.length) // 追加したブロックを牌の追加先にする
  }

  function removeOtherDiscardBlock(blockIdx) {
    setOtherDiscards(prev => prev.filter((_, i) => i !== blockIdx))
    setSutehaiActiveIdx(prev => prev > blockIdx ? prev - 1 : prev === blockIdx ? 0 : prev)
    // 削除したブロックへ副露を追加中ならキャンセルし、後ろのブロックが対象なら index を詰める
    setAddingMeld(prev => {
      if (!prev || prev.target === 'hand') return prev
      if (prev.target === blockIdx) return null
      return prev.target > blockIdx ? { ...prev, target: prev.target - 1 } : prev
    })
  }

  function addOtherDiscardTile(tile) {
    if (activeSutehaiIdx < 0) return
    updateOtherDiscard(activeSutehaiIdx, od => ({ ...od, tiles: [...od.tiles, tile] }))
  }

  function removeOtherDiscardTile(blockIdx, index) {
    updateOtherDiscard(blockIdx, od => ({
      ...od,
      tiles: od.tiles.filter((_, i) => i !== index),
      riichiIndex: od.riichiIndex === null || od.riichiIndex === index
        ? null
        : od.riichiIndex > index ? od.riichiIndex - 1 : od.riichiIndex,
    }))
  }

  function moveOtherDiscardTile(blockIdx, from, insertAt) {
    // insertAt は移動前の配列基準の挿入位置（0〜length）。from を取り除いた後の位置に補正する
    const to = insertAt > from ? insertAt - 1 : insertAt
    if (from === to) return
    updateOtherDiscard(blockIdx, od => {
      const next = [...od.tiles]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      // リーチ宣言牌の位置を並べ替えに追従させる
      let riichi = od.riichiIndex
      if (riichi !== null) {
        if (riichi === from) {
          riichi = to
        } else {
          const idx = riichi > from ? riichi - 1 : riichi
          riichi = idx >= to ? idx + 1 : idx
        }
      }
      return { ...od, tiles: next, riichiIndex: riichi }
    })
  }

  // ドラッグ中の挿入位置を更新する。移動しても並びが変わらない位置（自分の前後）はインジケーターを出さない
  function updateSutehaiDropIndex(pos) {
    setSutehaiDropIndex(pos === sutehaiDrag?.index || pos === sutehaiDrag?.index + 1 ? null : pos)
  }

  function toggleOtherDiscardRiichi(blockIdx, index) {
    updateOtherDiscard(blockIdx, od => ({ ...od, riichiIndex: od.riichiIndex === index ? null : index }))
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

  // 牌姿テキストの一括入力。1枚も読み取れなかったときは手牌を消さずに入力欄も残す
  // （打ち間違いで手牌が消えないようにするため）
  function applyTilesText() {
    const parsed = parseTileNotation(tilesInput)
    if (parsed.length === 0) return
    setTiles(sortTiles(parsed))
    setTilesInput('')
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
    boardView,
    problemType,
    discardedTile:    discardedTile || null,
    nakiChoices,
    questionImageUrl: questionImageUrl || null,
    bakaze,
    kyoku,
    honba,
    jikaze,
    junme,
    scores,
    note,
    // アプリ側（OtherDiscardDisplay）は家と牌の両方が揃わないと表示しないため、
    // 片方だけの不完全なブロックは保存しない（画面には警告を出す）。
    // 家が重複するブロック（後のもの）も除外し、0件なら null 保存。
    // 自風（自分）の捨て牌も保存できる（2026-07-27〜。盤面で自分の河を表示するため）
    otherDiscards: (() => {
      const seen = new Set()
      const valid = otherDiscards.filter(od => {
        if (!od.player || od.tiles.length === 0 || seen.has(od.player)) return false
        seen.add(od.player)
        return true
      })
      return valid.length > 0 ? valid : null
    })(),
  }), [problem, tiles, answer, dora, riichi, melds, explanation, reviewed, disabled, boardView, problemType, discardedTile, nakiChoices, questionImageUrl, bakaze, kyoku, honba, jikaze, junme, scores, note, otherDiscards])

  // 副露だけ設定しても「家＋捨て牌」が揃わない限り保存されない（保存条件は捨て牌ベースのまま）
  // 正解の配列表現（表示・選択状態の判定用。answer 本体はカンマ区切り文字列のまま）
  const answerList = parseAnswers(answer)

  // ベタオリの正解順プレビューのドラッグ並べ替え
  function moveAnswer(from, to) {
    const list = [...answerList]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setAnswer(list.join(','))
  }
  const { containerRef: answerOrderRef, dragIndex: answerDragIndex, dropIndex: answerDropIndex, handlers: answerDragHandlers } =
    useDragReorder(moveAnswer)

  const otherDiscardIncomplete = otherDiscards.some(od =>
    (od.player !== null && od.tiles.length === 0) ||
    (od.player === null && (od.tiles.length > 0 || od.melds.length > 0))
  )
  // 同じ家のブロックが複数ある場合は誤り。警告し、後のブロックは保存されない
  const otherDiscardDuplicatePlayer = otherDiscards.some((od, i) =>
    od.player !== null && otherDiscards.slice(0, i).some(o => o.player === od.player)
  )
  // リーチ宣言牌の設定漏れは警告のみ（リーチしていない他家の捨て牌もあり得るため保存はされる）
  const otherDiscardRiichiMissing = otherDiscards.some(od =>
    od.player !== null && od.tiles.length > 0 && od.riichiIndex === null
  )

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

  // 盤面（手牌・状況設定・捨て牌）を編集できるか。
  // 牌譜から作った問題は「実在の局面をそのまま出題する」のが基本なので既定でロックする
  const [boardLocked, setBoardLocked] = useState(lockBoard)

  const [paletteTab,  setPaletteTab]  = useState(lockBoard ? 'answer' : 'hand')
  const [paletteMode, setPaletteMode] = useState(lockBoard ? 'explanation' : 'hand')

  // 共通パレットの送り先モード。タブや問題タイプに依存するモードは文脈があるときだけ出す。
  // 副露追加中は「副露」に固定（setState不要にするため、実効モードは描画時に導出する）。
  // ロック中は盤面を変えるモード（手牌・副露・ドラ・捨て牌）を外す
  const availableModes = [
    ...(boardLocked ? [] : ['hand', ...(addingMeld ? ['meld'] : []), 'dora']),
    'note',
    'explanation',
    ...(!boardLocked && paletteTab === 'sutehai' ? ['sutehai'] : []),
    ...(paletteTab === 'answer' && problemType === 'naki-timing' ? ['depai'] : []),
    ...(paletteTab === 'answer' && problemType === 'naki-choice' ? ['nakiChoice'] : []),
  ]
  const fallbackMode = boardLocked ? 'explanation' : 'hand'
  const effectiveMode = addingMeld && !boardLocked
    ? 'meld'
    : (availableModes.includes(paletteMode) ? paletteMode : fallbackMode)

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

  // 副露の追加先ラベル（手牌 or ◯家）。ステータス表示でどこに追加中かを示す
  const meldTargetLabel = !addingMeld ? ''
    : addingMeld.target === 'hand' ? '手牌'
    : otherDiscards[addingMeld.target]?.player
      ? `${otherDiscards[addingMeld.target].player}家`
      : `${addingMeld.target + 1}人目`

  // 注釈の入力欄。通常は手牌タブ、盤面ロック中は正解設定タブに出す
  // （ロック中は手牌タブが無くなるため。二重に定義せず同じものを使い回す）
  const noteEditor = (
    <>
      <div className="palette-tab-divider" />
      <div className="editor-section-label">
        注釈
        {textLimits?.note && <TextCount len={note.length} max={textLimits.note} />}
      </div>
      <textarea
        ref={noteRef}
        className="explanation-textarea"
        value={note}
        onChange={e => setNote(e.target.value)}
        onFocus={() => { noteTouchedRef.current = true; setPaletteMode('note') }}
        placeholder="状況設定に関する注釈を入力してください（牌は下のパレットからカーソル位置に挿入できます）"
        rows={2}
        maxLength={textLimits?.note ?? undefined}
      />
    </>
  )

  // 盤面クリックで対応する編集パネルを開く（盤面からデータは書き換えない）。
  // ハイライトは逆にタブ側から導出するので、タブを直接切り替えても盤面の選択表示が追従する
  const activeArea = boardLocked ? null
    : paletteTab === 'sutehai' ? `sutehai:${activeSutehaiIdx}`
    : paletteTab === 'jokyo' ? 'jokyo'
    : paletteTab === 'hand'  ? 'hand'
    : null

  // index は kind ごとに意味が違う（sutehai＝家ブロックの番号 / jokyo＝クリックした家の風）
  function handleSelectArea(kind, index) {
    // ロック中は開く先のタブが無いので何もしない（盤面のクリックは無反応になる）
    if (boardLocked) return
    if (kind === 'hand') {
      setPaletteTab('hand')
      setPaletteMode('hand')
    } else if (kind === 'jokyo') {
      setPaletteTab('jokyo')
      setPaletteMode('dora')
      setActiveScoreWind(index ?? null)
    } else if (kind === 'sutehai') {
      setPaletteTab('sutehai')
      setPaletteMode('sutehai')
      if (index >= 0) setSutehaiActiveIdx(index)
    } else if (kind === 'dora') {
      // ドラは盤面の王牌から設定する。タブは変えず、下のパレットの送り先だけ切り替える
      setPaletteMode('dora')
    }
  }

  const paletteStatus = {
    hand:        `手牌: ${tiles.length}枚`,
    meld:        addingMeld ? `${meldTargetLabel}の${MELD_TYPE_LABELS[addingMeld.type]}: ${addingMeld.tiles.length} / ${MELD_TILE_COUNT[addingMeld.type]}枚` : '',
    dora:        `ドラ: ${dora ? getTileLabel(dora) : 'なし'}`,
    note:        '注釈のカーソル位置に挿入',
    explanation: '解説のカーソル位置に挿入',
    sutehai:     activeSutehaiIdx >= 0
      ? `${otherDiscards[activeSutehaiIdx].player ? `${otherDiscards[activeSutehaiIdx].player}家` : `${activeSutehaiIdx + 1}人目`}捨て牌: ${otherDiscards[activeSutehaiIdx].tiles.length}枚`
      : '「家を追加」を押してください',
    depai:       `出牌: ${discardedTile ? getTileLabel(discardedTile) : '未設定'}`,
    nakiChoice:  `選択肢: ${nakiChoices.length}件`,
  }[effectiveMode]

  return (
    <div className="editor">
      {/* 前後の移動はサイドバーの問題一覧と ←/→ キー（AdminApp）に任せ、ナビ行は置かない */}
      <div className="editor-columns">
      {/* 左：盤面。クリックすると右カラムの対応するパネルへ切り替わる */}
      <div className="editor-board-col">
        <BoardView
          tiles={tiles}
          melds={melds}
          dora={dora}
          answerList={answerList}
          bakaze={bakaze}
          kyoku={kyoku}
          honba={honba}
          jikaze={jikaze}
          junme={junme}
          scores={scores}
          otherDiscards={otherDiscards}
          concealedCounts={concealedCounts}
          activeArea={activeArea}
          onSelectArea={handleSelectArea}
          {...(boardLocked ? {} : {
            // ロック中は編集用のコールバックを渡さない＝盤面から局面を変えられない
            onChangeBakaze:   setBakaze,
            onChangeKyoku:    setKyoku,
            onChangeHonba:    setHonba,
            onChangeJikaze:   setJikaze,
            onChangeJunme:    setJunme,
            onRemoveHandTile: removeTile,
          })}
        />

        {/* 共通牌パレット。盤面の下（左カラム内）に置き、幅を盤面に合わせる。
            右カラムは設定専用。送り先モードで牌の追加先を切り替える */}
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
          {/* 牌は4行で 310px ほどしか使わないので、右の余白を操作ガイドに使う。
              paletteAside を渡さなければ従来どおり牌だけが並ぶ（管理画面はこちら） */}
          <div className="palette-dock-body">
            <div className="palette-dock-tiles">
              <TilePalette size={28} onTileClick={handlePaletteTile} />
            </div>
            {paletteAside && <div className="palette-dock-aside">{paletteAside}</div>}
          </div>
        </div>
      </div>

      {/* 右：編集パネル。パレットをタブの内容量に関わらず画面下端に留めるため、
          パレット以外をスクロール領域（.editor-panel-scroll）で包む */}
      <div className="editor-panel-col">
      <div className="editor-panel-scroll">

      {/* ヘッダー：ID・問題タイプ・フラグ・保存を1行にまとめて縦の場所を節約する */}
      <div className="editor-header">
        {headerLead ?? <h3 className="editor-title">ID {problem.id}</h3>}
        {/* 何のプルダウンか分かるようラベルを付ける（値だけだと用途が読み取れないため） */}
        <label className="editor-type-field">
          <span className="editor-type-label">問題タイプ:</span>
          <select
            className="editor-type-select"
            value={problemType}
            onChange={e => setProblemType(e.target.value)}
          >
            {Object.entries(PROBLEM_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {!hideReviewed && (
          <label className="reviewed-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={e => { reviewedTouchedRef.current = true; setReviewed(e.target.checked) }}
            />
            修正済み
          </label>
        )}
        {!hideDisabled && (
          <label className="reviewed-check" style={{ color: disabled ? '#e74c3c' : undefined }}>
            <input
              type="checkbox"
              checked={disabled}
              onChange={e => setDisabled(e.target.checked)}
            />
            非表示
          </label>
        )}
        {/* 出題画面をこの盤面と同じ「麻雀卓」の形にする。
            外すと従来表示（手牌＋他家の捨て牌を縦に並べる）になる。
            自作問題は常に盤面なので、あちらではこの設定を出さない（hideBoardView） */}
        {!hideBoardView && (
          <label
            className="reviewed-check"
            title="出題画面を麻雀卓の形で表示する（局・点数・各家の河が卓に入る）"
          >
            <input
              type="checkbox"
              checked={boardView}
              onChange={e => setBoardView(e.target.checked)}
            />
            盤面で出題
          </label>
        )}
        {/* 牌譜から作った問題は実在の局面をそのまま出すのが基本なので、
            盤面はロックしておき、変えたいときだけここで解除する */}
        {lockBoard && (
          <label className="reviewed-check" title="手牌・状況設定・捨て牌を変更できるようにする">
            <input
              type="checkbox"
              checked={!boardLocked}
              onChange={e => {
                const unlock = e.target.checked
                setBoardLocked(!unlock)
                // 残るタブが変わるので、送り先も切り替える
                setPaletteTab(unlock ? 'hand' : 'answer')
                setPaletteMode(unlock ? 'hand' : 'explanation')
              }}
            />
            盤面を編集
          </label>
        )}
        {/* 保存・保存して次へ・削除はひとまとまり（折り返しても3つが分かれないようにする） */}
        <div className="editor-header-actions">
          <button className="editor-save-btn" onClick={handleSave}>保存</button>
          <button className="editor-save-next-btn" onClick={handleSaveAndNext} disabled={!hasNext}>
            保存して次へ <kbd>Ctrl+S</kbd>
          </button>
          {saveStatus && <span className="editor-save-status">{saveStatus}</span>}
          {/* Xへの共有（管理画面だけ。my問題集は一覧側に入口があるので渡していない）。
              共有するのは「いま画面に見えている内容」＝未保存の編集も含む buildSaveData()。
              ★ 問題画像はURLに載せられないので、画像付きの問題は共有できない
                （盤面だけが飛んで問題が成立しないため） */}
          {onShare && (
            <ShareButton
              onClick={() => onShare(buildSaveData())}
              disabled={!!questionImageUrl}
              title={questionImageUrl
                ? '問題画像は共有リンクに含められないため、画像付きの問題は共有できません'
                : 'いま編集している内容をXで共有します'}
            >
              Xで共有
            </ShareButton>
          )}
          {!hideDelete && (
            <button
              className="editor-delete-btn"
              onClick={() => {
                if (window.confirm(`問題 #${problem.id} を削除しますか？\nこの問題の全ユーザーの正誤記録も削除されます。この操作は取り消せません。`)) {
                  onDelete(problem.id)
                }
              }}
            >
              この問題を削除
            </button>
          )}
        </div>
      </div>

      {/* 問題画像（任意・全タイプ共通）。ほとんどの問題では未設定なので、
          未設定のときは1行のボタンだけにして縦の場所を使わない */}
      {!hideImage && (
      <section className="editor-section editor-section--image">
        {questionImageUrl || problem.image || imageOpen ? (
          <>
            <div className="editor-section-label">
              問題画像（任意）
              <button className="dora-clear" onClick={() => setImageOpen(false)}>閉じる</button>
            </div>
            <QuestionImage value={questionImageUrl} wrapClassName="editor-image-wrap" imgClassName="editor-image" />
            {/* 参照用画像（scan-tiles で生成した問題のみ） */}
            {problem.image && (
              <div className="editor-image-wrap">
                <img src={problem.image} alt="問題" className="editor-image" />
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
                <button className="dora-clear" onClick={handleImageDelete}>画像を削除</button>
              )}
            </div>
          </>
        ) : (
          <button className="editor-image-open" onClick={() => setImageOpen(true)}>＋ 問題画像を追加（任意）</button>
        )}
      </section>
      )}

      {/* === パレット統合エリア === */}
      <section className="editor-section editor-section--palette">
        <div className="palette-tab-bar">
          {/* ロック中は盤面を変えるタブを出さない（残るのは正解設定だけ） */}
          {!boardLocked && <>
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
            点数
          </button>
          <button
            className={`palette-tab-btn${paletteTab === 'sutehai' ? ' palette-tab-btn--active' : ''}`}
            onClick={() => { setPaletteTab('sutehai'); setPaletteMode('sutehai') }}
          >
            捨て牌
          </button>
          </>}
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
                    applyTilesText()
                  }
                }}
                placeholder="例: 23467m234p234888s（Enterで適用）"
              />
              <button
                className="tiles-text-apply-btn"
                onClick={applyTilesText}
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
            <div className="editor-section-label">
              副露（鳴き）<span className="tile-count">手牌 {tiles.length}枚</span>
            </div>
            {melds.length > 0 && (
              <div className="editor-melds-inline">
                {melds.map((meld, i) => (
                  <div key={i} className="editor-meld-inline-item">
                    <span className="editor-meld-inline-label">
                      {MELD_TYPE_LABELS[meld.type]}
                      <MeldFromSelect type={meld.type} value={meld.from} onChange={f => updateMeldFrom(i, f)} />
                    </span>
                    <MeldPreview meld={meld} />
                    <button className="editor-meld-inline-remove" onClick={() => removeMeld(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
            {addingMeld?.target === 'hand' ? (
              <MeldAddingPanel
                meld={addingMeld}
                onCancel={() => setAddingMeld(null)}
                onRemoveTile={removeTileFromMeld}
                onChangeFrom={changeAddingMeldFrom}
              />
            ) : (
              <div className="meld-add-btns">
                {MELD_TYPES.map(type => (
                  <button key={type} className="meld-add-btn" onClick={() => startAddMeld(type)}>
                    {MELD_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            )}

            {/* 注釈は手牌と一緒に書くことが多いのでこのタブに置く（点数タブには置かない）。
                盤面ロック中はこのタブ自体が出ないので、正解設定タブに同じものを出す */}
            {noteEditor}
          </div>
        )}

        {/* 点数タブ。
            ドラ・場風・局・自風・巡目は盤面の中央フィールドで直接設定するのでここには置かない
            （盤面を見ながら設定できるほうが速く、右カラムの縦の長さも抑えられる） */}
        {paletteTab === 'jokyo' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">点数状況</div>
            {/* 点数は常に既定値（全員25000）が入る仕様なので「未設定」の選択肢は置かない */}
            {(() => {
              const total = SCORE_WINDS.reduce((sum, w) => sum + (scores[w] ?? 0), 0) + (scores.kyotaku ?? 0)
              const totalOk = total === 100000
              return (
                <div className="score-edit-area">
                  {SCORE_WINDS.map(w => (
                    <ScoreInputRow
                      key={w}
                      label={`${w}家`}
                      isSelf={jikaze === w}
                      active={activeScoreWind === w}
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
          </div>
        )}

        {/* 捨て牌タブ（自分を含む各家の河。データ構造の都合で変数名は otherDiscards のまま） */}
        {paletteTab === 'sutehai' && (
          <div className="palette-tab-content">
            {otherDiscards.map((od, bi) => (
              <div
                key={bi}
                className={`other-discard-block${activeSutehaiIdx === bi ? ' other-discard-block--active' : ''}`}
                onClick={() => setSutehaiActiveIdx(bi)}
              >
                <div className="editor-section-label">
                  家{otherDiscards.length > 1 ? `（${bi + 1}人目${activeSutehaiIdx === bi ? '・牌の追加先' : ''}）` : ''}
                  <button
                    className="dora-clear"
                    onClick={e => { e.stopPropagation(); removeOtherDiscardBlock(bi) }}
                  >
                    この家を削除
                  </button>
                </div>
                <WindSelector
                  value={od.player}
                  onChange={v => updateOtherDiscard(bi, o => ({ ...o, player: v }))}
                  winds={['東', '南', '西', '北']}
                  suffix="家"
                  selfWind={jikaze}
                />

                <div className="editor-section-label">
                  捨て牌（クリックでリーチ宣言牌に設定/解除、×で削除）
                  {od.tiles.length > 0 && (
                    <button
                      className="dora-clear"
                      onClick={() => updateOtherDiscard(bi, o => ({ ...o, tiles: [], riichiIndex: null }))}
                    >
                      全削除
                    </button>
                  )}
                </div>
                <div
                  className="other-discard-tiles-list"
                  onDragOver={e => {
                    // 牌の隙間・末尾の空き領域では末尾への挿入とみなす（牌上は各アイテム側で処理）
                    if (sutehaiDrag?.block !== bi) return
                    e.preventDefault()
                    updateSutehaiDropIndex(od.tiles.length)
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    if (sutehaiDrag?.block === bi && sutehaiDropIndex !== null) {
                      moveOtherDiscardTile(bi, sutehaiDrag.index, sutehaiDropIndex)
                    }
                    setSutehaiDrag(null)
                    setSutehaiDropIndex(null)
                  }}
                >
                  {od.tiles.map((t, i) => (
                    <div
                      key={i}
                      className={
                        `other-discard-tile-item${od.riichiIndex === i ? ' other-discard-tile-item--riichi' : ''}` +
                        `${sutehaiDrag?.block === bi && sutehaiDrag.index === i ? ' other-discard-tile-item--dragging' : ''}` +
                        `${sutehaiDrag?.block === bi && sutehaiDropIndex === i ? ' other-discard-tile-item--drop-before' : ''}` +
                        `${sutehaiDrag?.block === bi && sutehaiDropIndex === i + 1 && i === od.tiles.length - 1 ? ' other-discard-tile-item--drop-after' : ''}`
                      }
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', '') // Firefoxはこれが無いとドラッグが始まらない
                        setSutehaiDrag({ block: bi, index: i })
                      }}
                      onDragEnd={() => { setSutehaiDrag(null); setSutehaiDropIndex(null) }}
                      onDragOver={e => {
                        if (sutehaiDrag?.block !== bi) return
                        e.preventDefault()
                        e.stopPropagation()
                        // カーソルが牌の左半分なら前、右半分なら後ろに挿入
                        const rect = e.currentTarget.getBoundingClientRect()
                        updateSutehaiDropIndex(e.clientX < rect.left + rect.width / 2 ? i : i + 1)
                      }}
                    >
                      <button className="other-discard-tile-remove" onClick={() => removeOtherDiscardTile(bi, i)}>×</button>
                      <div
                        className={`other-discard-tile-img-wrap${od.riichiIndex === i ? ' tile-rotated' : ''}`}
                        onClick={() => toggleOtherDiscardRiichi(bi, i)}
                        title={getTileLabel(t)}
                      >
                        <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                      </div>
                    </div>
                  ))}
                  {od.tiles.length === 0 && <span className="editor-empty">牌を追加してください</span>}
                </div>

                <div className="editor-section-label">副露（鳴き）</div>
                {od.melds.length > 0 && (
                  <div className="editor-melds-inline">
                    {od.melds.map((meld, mi) => (
                      <div key={mi} className="editor-meld-inline-item">
                        <span className="editor-meld-inline-label">
                          {MELD_TYPE_LABELS[meld.type]}
                          <MeldFromSelect
                            type={meld.type}
                            value={meld.from}
                            onChange={f => updateOtherDiscardMeldFrom(bi, mi, f)}
                          />
                        </span>
                        <MeldPreview meld={meld} />
                        <button className="editor-meld-inline-remove" onClick={() => removeOtherDiscardMeld(bi, mi)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {addingMeld?.target === bi ? (
                  <MeldAddingPanel
                    meld={addingMeld}
                    onCancel={() => setAddingMeld(null)}
                    onRemoveTile={removeTileFromMeld}
                    onChangeFrom={changeAddingMeldFrom}
                  />
                ) : (
                  <div className="meld-add-btns">
                    {MELD_TYPES.map(type => (
                      <button key={type} className="meld-add-btn" onClick={() => startAddOtherDiscardMeld(bi, type)}>
                        {MELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {otherDiscards.length < 4 && (
              <button className="other-discard-add-block" onClick={addOtherDiscardBlock}>
                ＋ 家を追加（自分を含め最大4人）
              </button>
            )}
            {otherDiscardIncomplete && (
              <div className="other-discard-warning">
                ⚠ 家と捨て牌の両方を設定してください。揃っていない家は（副露も含めて）保存されません。
              </div>
            )}
            {otherDiscardDuplicatePlayer && (
              <div className="other-discard-warning">
                ⚠ 同じ家が複数設定されています。重複した家は最初の1つだけ保存されます。
              </div>
            )}
            {otherDiscardRiichiMissing && (
              <div className="other-discard-warning">
                ⚠ リーチ宣言牌が設定されていません。指定する場合は捨て牌をクリックしてください（リーチしていない家なら未設定のまま保存できます）。
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
                <div className="editor-section-label">正解牌（クリックで追加/解除・複数選択可）</div>
                <div className="editor-tiles">
                  {[...new Set(tiles)].map(t => (
                    <TileImg
                      key={t} tile={t}
                      onClick={() => toggleAnswer(t)}
                      className={`editor-tile ${answerList.includes(t) ? 'tile--answer' : ''}`}
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
                          className={`editor-ankan-btn${answerList.includes(`ankan:${t}`) ? ' editor-ankan-btn--active' : ''}`}
                          onClick={() => toggleAnswer(`ankan:${t}`)}
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
                    {answerList.length > 0
                      ? answerList
                          .map(a => a.startsWith('ankan:') ? `暗槓（${getTileLabel(a.slice(6))}）` : getTileLabel(a))
                          .join('・')
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
                <div className="editor-current palette-tab-status">
                  現在の出牌: <strong>{discardedTile ? getTileLabel(discardedTile) : '未設定'}</strong>
                  {discardedTile && (
                    <img
                      src={getTileImageUrl(discardedTile)}
                      alt={getTileLabel(discardedTile)}
                      className="palette-tab-status-tile"
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

            {/* ベタオリ（安全な順に並べる） */}
            {problemType === 'betaori' && (
              <>
                <div className="editor-section-label">正解牌（安全な順にクリック・再クリックで解除。①が最も安全）</div>
                <div className="editor-tiles">
                  {[...new Set(tiles)].map(t => {
                    const pos = answerList.indexOf(t)
                    return (
                      <span key={t} className="editor-order-tile">
                        <TileImg
                          tile={t}
                          onClick={() => toggleAnswer(t)}
                          className={`editor-tile ${pos >= 0 ? 'tile--answer' : ''}`}
                        />
                        {pos >= 0 && <span className="editor-order-badge">{pos + 1}</span>}
                      </span>
                    )
                  })}
                  {tiles.length === 0 && <span className="editor-empty">先に手牌を設定してください</span>}
                </div>
                <div className="editor-current">
                  現在の正解（ドラッグで入れ替え・{answerList.length}枚 — 出題画面でもこの枚数を選ばせます）:
                </div>
                {answerList.length > 0 ? (
                  <div className="editor-order-list" ref={answerOrderRef}>
                    {answerList.map((a, i) => (
                      <div
                        key={a}
                        data-drag-index={i}
                        className={
                          'editor-order-tile editor-order-tile--draggable' +
                          (answerDragIndex === i ? ' editor-order-tile--dragging' : '') +
                          (answerDropIndex === i ? ' editor-order-tile--drop-before' : '') +
                          (answerDropIndex === i + 1 && i === answerList.length - 1 ? ' editor-order-tile--drop-after' : '')
                        }
                        {...answerDragHandlers}
                      >
                        <img src={getTileImageUrl(a)} alt={getTileLabel(a)} draggable={false} />
                        <span className="editor-order-badge">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="editor-empty">未設定（上の手牌をクリックして安全な順に追加）</span>
                )}
              </>
            )}

            <div className="palette-tab-divider" />
            <div className="editor-section-label">
              解説テキスト
              {textLimits?.explanation && (
                <TextCount len={explanation.length} max={textLimits.explanation} />
              )}
            </div>
            <textarea
              ref={explanationRef}
              className="explanation-textarea"
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              onFocus={() => { explanationTouchedRef.current = true; setPaletteMode('explanation') }}
              placeholder="解説を入力してください（牌は下のパレットからカーソル位置に挿入できます）"
              rows={3}
              maxLength={textLimits?.explanation ?? undefined}
            />

            {/* 盤面ロック中は手牌タブが無いので、注釈をここに出す */}
            {boardLocked && noteEditor}
          </div>
        )}
      </section>

      {/* 保存・削除はヘッダー行に移したので、ここは保存時の警告だけ（無いときは行ごと出さない） */}
      {(otherDiscardIncomplete || otherDiscardDuplicatePlayer || otherDiscardRiichiMissing) && (
        <div className="editor-save-area">
          {otherDiscardIncomplete && (
            <span className="editor-save-warning">
              ⚠ 捨て牌に未完成の家（家と捨て牌の両方が必要）があり、その分は副露も含めて保存されません
            </span>
          )}
          {otherDiscardDuplicatePlayer && (
            <span className="editor-save-warning">
              ⚠ 捨て牌に同じ家が複数あり、最初の1つだけ保存されます
            </span>
          )}
          {otherDiscardRiichiMissing && (
            <span className="editor-save-warning">
              ⚠ リーチ宣言牌が未設定です（このままでも保存されます）
            </span>
          )}
        </div>
      )}

      </div>{/* /editor-panel-scroll */}

      </div>{/* /editor-panel-col */}
      </div>{/* /editor-columns */}
    </div>
  )
}
