import { useState, useEffect, useCallback, useRef } from 'react'
import { getTileImageUrl, getTileLabel, sortTiles, getDoraIndicator } from '../utils/tileUtils'
import { normalizeProblemType, parseAnswers } from '../utils/judgeUtils'
import {
  NAKI_TIMING_OPTIONS, MELD_TYPE_LABELS, MELD_TILE_COUNT, normalizeMelds, PROBLEM_TYPE_LABELS,
} from '../utils/problemConstants'
import { parseTileNotation } from '../utils/importBoard'
import { useIsNarrow } from '../utils/useMediaQuery'
import { questionImagePath, QUESTION_IMAGE_BUCKET } from '../utils/questionImage'
import { useDragReorder } from '../utils/useDragReorder'
import {
  emptyDiscardBlock, toDiscardBlock, addDiscardTile, removeDiscardTile,
  moveDiscardTile, clearDiscardTiles, toggleDiscardRiichi,
} from '../utils/discardEdit'
import QuestionImage from '../components/QuestionImage'
import ShareButton from '../components/ShareButton'
import { supabase } from '../lib/supabase'

import BoardView from './BoardView'
import ResponsiveBoard from '../components/ResponsiveBoard'

// 定数と表示部品は src/admin/editor/ に切り出してある。
// このファイルは state とパネルの組み立てに専念する（部品は props で完結させ、state を持たせない）
import {
  PALETTE_TABS, PANEL_TITLES, panelOfTab, answerPaletteMode, newAddingMeld,
  SCORE_WINDS, DEFAULT_SCORES,
} from './editor/constants'
import TileImg from './editor/TileImg'
import { MeldPreview, MeldFromSelect, MeldTypeTabs, MeldAddingPanel } from './editor/MeldParts'
import TilePalette from './editor/TilePalette'
import { ScoreInputRow, ScoreSheet } from './editor/ScoreParts'
import { WindSelector, TextCount } from './editor/FormParts'

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
//   saveLabel    … 保存ボタンの文言。未ログインの作問（my問題集のゲスト）では
//                  押すとログインに進むので「ログインして保存」に差し替える
//   hideSaveNext … 「保存して次へ」を隠す。次の問題という概念が無い場面（ゲスト・牌譜の下書き）用。
//                  hasNext=false でも disabled のボタンが残ると何が押せるのか分かりにくいため
export default function ProblemEditor({
  problem, prevProblem, onSave, onSaveAndNext, onDelete, hasNext,
  hideImage = false, hideReviewed = false, hideDelete = false, headerLead = null,
  saveStatus = null, lockBoard = false, concealedCounts = null,
  hideDisabled = false, paletteAside = null, textLimits = null, hideBoardView = false,
  onShare = null, saveLabel = '保存', hideSaveNext = false,
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
    // ★ ブロックの正規化は toDiscardBlock が唯一の実装。ここで項目を書き下すと拾い漏らす
    //   （実際に tsumogiri を落として、牌譜から作った問題を保存するとツモ切りが消えていた）
    const base = (otherDiscardsBase ?? []).map(toDiscardBlock)
    // データが無くても1人目の空ブロックを出しておく（未設定のままなら保存時に除外されて null になる）
    return base.length > 0 ? base : [emptyDiscardBlock()]
  })
  // 盤面の点数チップからどの家をクリックしたか（点数タブでその家の行をハイライトする）
  const [activeScoreWind, setActiveScoreWind] = useState(null)
  // スマホの点数ポップアップで開いている家（'東'〜'北' か 'kyotaku'。null なら閉じている）
  const [scoreSheet, setScoreSheet] = useState(null)
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
    setAddingMeld(newAddingMeld(type, 'hand'))
  }

  function startAddOtherDiscardMeld(blockIdx, type) {
    setSutehaiActiveIdx(blockIdx)
    setAddingMeld(newAddingMeld(type, blockIdx))
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
      // 副露タブにいる間は同じ種類で入力待ちに戻す（続けて2つ目を鳴かせるため）。
      // null にすると送り先が「副露」のままパレットが効かない状態になる。
      // 捨て牌タブから家の副露を足したときは従来どおり解除して捨て牌の送り先へ戻る
      setAddingMeld(paletteTab === 'meld' && addingMeld.target === 'hand'
        ? newAddingMeld(addingMeld.type, 'hand')
        : null)
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
    setOtherDiscards(prev => [...prev, emptyDiscardBlock()])
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
    updateOtherDiscard(activeSutehaiIdx, od => addDiscardTile(od, tile))
  }

  function removeOtherDiscardTile(blockIdx, index) {
    updateOtherDiscard(blockIdx, od => removeDiscardTile(od, index))
  }

  function moveOtherDiscardTile(blockIdx, from, insertAt) {
    updateOtherDiscard(blockIdx, od => moveDiscardTile(od, from, insertAt))
  }

  // ドラッグ中の挿入位置を更新する。移動しても並びが変わらない位置（自分の前後）はインジケーターを出さない
  function updateSutehaiDropIndex(pos) {
    setSutehaiDropIndex(pos === sutehaiDrag?.index || pos === sutehaiDrag?.index + 1 ? null : pos)
  }

  function toggleOtherDiscardRiichi(blockIdx, index) {
    updateOtherDiscard(blockIdx, od => toggleDiscardRiichi(od, index))
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
  // ★ リーチ宣言牌の設定漏れは警告しない（2026-08-01〜）。
  //   リーチしていない家の河のほうが多く、未設定が正常なので警告が鳴りっぱなしになっていた

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
        // 「保存して次へ」を出していない場面（ゲスト・牌譜の下書き）では素の保存に回す
        if (hideSaveNext) handleSave()
        else handleSaveAndNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSaveAndNext, handleSave, hideSaveNext])

  // 盤面（手牌・状況設定・捨て牌）を編集できるか。
  // 牌譜から作った問題は「実在の局面をそのまま出題する」のが基本なので既定でロックする
  const [boardLocked, setBoardLocked] = useState(lockBoard)

  // スマホ幅（600px以下）かどうか。CSS で書けるものは CSS に置き、ここで見るのは
  // 「盤面を縮小して出す」「ヘッダー行を先頭へ移す」「タブを減らす」の3つだけ
  const isNarrow = useIsNarrow()

  const [paletteTab,  setPaletteTab]  = useState(lockBoard ? 'answer' : 'hand')
  const [paletteMode, setPaletteMode] = useState(lockBoard ? 'explanation' : 'hand')

  // 送り先として成立するモードの一覧（タブ列には出さないモードも含む妥当性チェック用）。
  // 送り先はタブのクリック・盤面の王牌クリック・textarea のフォーカスから設定されるので、
  // ここはロックや問題タイプが変わったときに古い値へ取り残されるのを防ぐためだけにある。
  // 副露追加中は「副露」に固定（setState不要にするため、実効モードは描画時に導出する）
  const availableModes = [
    ...(boardLocked ? [] : ['hand', 'meld', 'dora', 'sutehai']),
    'note',
    'explanation',
    ...(problemType === 'naki-timing' ? ['depai'] : []),
    ...(problemType === 'naki-choice' ? ['nakiChoice'] : []),
  ]
  const fallbackMode = boardLocked ? 'explanation' : 'hand'
  const effectiveMode = addingMeld && !boardLocked
    ? 'meld'
    : (availableModes.includes(paletteMode) ? paletteMode : fallbackMode)

  // タブ列に出すタブ。点数は盤面の点数チップから開くので PC では常設せず、
  // 開いている間だけ末尾に出す（タブ列に選択中が1つも無い状態を作らないため）。
  // スマホは盤面を縮小して出すぶん点数チップが小さいので、点数タブを常設する
  const visibleTabs = PALETTE_TABS.filter(t => !(boardLocked && t.boardOnly))
  const jokyoTab = { key: 'jokyo', label: '点数' }
  const tabList = isNarrow
    // スマホは常設。末尾に足すとタブ列の横スクロールの先に隠れるので、盤面の設定が並ぶドラの隣に置く
    ? (boardLocked ? visibleTabs : visibleTabs.flatMap(t => t.key === 'dora' ? [t, jokyoTab] : [t]))
    : (paletteTab === 'jokyo' ? [...visibleTabs, jokyoTab] : visibleTabs)
  // 画面幅が変わってタブが消えたとき（捨て牌タブなど）に取り残されないよう、
  // 実効タブは state ではなく描画時に導出する（effect で setState しない）
  const activeTab = tabList.some(t => t.key === paletteTab)
    ? paletteTab
    : (tabList[0]?.key ?? 'answer')
  const activePanel = panelOfTab(activeTab, boardLocked)

  // タブの切り替え。送り先も一緒に決まる（同じ操作の入口を2つ作らない）
  function selectPaletteTab(key) {
    setPaletteTab(key)
    setPaletteMode(
      key === 'answer' ? answerPaletteMode(problemType)
      : key === 'jokyo' ? 'dora'
      : PALETTE_TABS.find(t => t.key === key)?.mode ?? fallbackMode
    )
    // 入力途中の副露はタブをまたいで持ち越さない。副露タブはポンから始める
    setAddingMeld(key === 'meld' ? newAddingMeld('pon', 'hand') : null)
    // 「〜に挿入」タブは牌がどこへ入るかを見せるため、その欄へカーソルを置く。
    // パネルが描かれた後でないと ref が空なので次のフレームで触る
    if (key === 'note' || key === 'explanation') {
      const ref = key === 'note' ? noteRef : explanationRef
      requestAnimationFrame(() => ref.current?.focus())
    }
  }

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
    : activeTab === 'sutehai' ? `sutehai:${activeSutehaiIdx}`
    : activeTab === 'jokyo' ? 'jokyo'
    : activeTab === 'dora'  ? 'dora'
    : activeTab === 'hand'  ? 'hand'
    : null

  // index は kind ごとに意味が違う（sutehai＝家ブロックの番号 / jokyo＝クリックした家の風）。
  // sutehai だけ第3引数でその席の風も受け取る（ブロックがまだ無い家を押したときに作るため）
  function handleSelectArea(kind, index, wind) {
    // ロック中は開く先のタブが無いので何もしない（盤面のクリックは無反応になる）
    if (boardLocked) return
    if (kind === 'hand') {
      selectPaletteTab('hand')
    } else if (kind === 'jokyo') {
      // 点数はタブ列に無いので selectPaletteTab を通さず直接開く
      setPaletteTab('jokyo')
      setPaletteMode('dora')
      setAddingMeld(null)
      setActiveScoreWind(index ?? null)
      // スマホは点数タブが一覧なので、家が分かっているならそのままポップアップまで開く
      if (isNarrow && index) setScoreSheet(index)
    } else if (kind === 'sutehai') {
      selectPaletteTab('sutehai')
      if (index >= 0) {
        setSutehaiActiveIdx(index)
      } else if (wind) {
        // まだブロックの無い家の河（または手牌）を押した。その家のブロックを用意して
        // すぐ牌を足せる状態にする（押したのに何も起きない、を無くすため）。
        // 家が未設定の空ブロックが余っていればそれを使い、無ければ足す（自分を含め最大4人）
        const emptyIdx = otherDiscards.findIndex(od => !od.player)
        if (emptyIdx >= 0) {
          setOtherDiscards(prev => prev.map((od, i) => i === emptyIdx ? { ...od, player: wind } : od))
          setSutehaiActiveIdx(emptyIdx)
        } else if (otherDiscards.length < 4) {
          setOtherDiscards(prev => [...prev, { ...emptyDiscardBlock(), player: wind }])
          setSutehaiActiveIdx(otherDiscards.length)
        }
      }
    } else if (kind === 'dora') {
      // 王牌のクリックはドラタブを開くのと同じ扱いにする（入口が2つあっても状態は1つ）。
      // selectPaletteTab が入力途中の副露も片付ける（残っていると送り先が meld のままになる）
      selectPaletteTab('dora')
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

  // ヘッダー行（ID・問題タイプ・フラグ・保存）。実体はこの1つで、置き場所だけ2つある:
  //   PC   … 右カラム（編集パネル）の先頭。1画面に収める従来のレイアウト
  //   スマホ … 縦積みなので右カラムの先頭＝画面のはるか下になる。ページの先頭へ持ち上げて
  //            sticky で貼り付ける（保存へいつでも手が届くようにするため）。
  // CSS の order は別のコンテナへは要素を移せないので、ここは JSX 側で出し分けている
  // （注釈欄 noteEditor と同じ「実体は1つ・置き場所だけ2つ」の形）
  const headerRow = (
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
        <button className="editor-save-btn" onClick={handleSave}>{saveLabel}</button>
        {!hideSaveNext && (
          <button className="editor-save-next-btn" onClick={handleSaveAndNext} disabled={!hasNext}>
            保存して次へ <kbd>Ctrl+S</kbd>
          </button>
        )}
        {saveStatus && <span className="editor-save-status">{saveStatus}</span>}
        {/* Xへの共有。共有するのは「いま画面に見えている内容」＝未保存の編集も含む buildSaveData()。
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
  )

  const boardProps = {
    tiles, melds, dora, answerList,
    bakaze, kyoku, honba, jikaze, junme,
    scores, otherDiscards, concealedCounts,
    activeArea,
    onSelectArea: handleSelectArea,
    // ロック中は編集用のコールバックを渡さない＝盤面から局面を変えられない
    ...(boardLocked ? {} : {
      onChangeBakaze:   setBakaze,
      onChangeKyoku:    setKyoku,
      onChangeHonba:    setHonba,
      onChangeJikaze:   setJikaze,
      onChangeJunme:    setJunme,
      onRemoveHandTile: removeTile,
    }),
  }

  return (
    <div className="editor">
      {/* スマホは縦積みなので、ヘッダー行をページの先頭に置いて画面上端へ貼り付ける */}
      {isNarrow && headerRow}
      {/* スマホの点数入力。点数タブの一覧と盤面の点数チップ、どちらから開いても同じシート */}
      {isNarrow && scoreSheet && (
        <ScoreSheet
          label={scoreSheet === 'kyotaku' ? '供託' : `${scoreSheet}家`}
          isSelf={jikaze === scoreSheet}
          value={scores[scoreSheet] ?? 0}
          steps={scoreSheet === 'kyotaku' ? [-1000, 1000] : [-10000, -1000, -100, 100, 1000, 10000]}
          onChange={v => setScores(prev => ({ ...prev, [scoreSheet]: v }))}
          onClose={() => setScoreSheet(null)}
        />
      )}
      {/* 前後の移動はサイドバーの問題一覧と ←/→ キー（AdminApp）に任せ、ナビ行は置かない */}
      <div className="editor-columns">
      {/* 左：盤面。クリックすると右カラムの対応するパネルへ切り替わる。
          スマホでは卓（約598px幅）がそのままでは入らないので、出題画面と同じ
          ResponsiveBoard（卓を丸ごと transform: scale する）に載せて幅に収める。
          ★ 牌の寸法（BoardView の TILE / HAND_TILE）には絶対に手を入れないこと */}
      <div className="editor-board-col">
        {isNarrow
          ? <ResponsiveBoard {...boardProps} readOnly={false} />
          : <BoardView {...boardProps} />}

        {/* 共通牌パレット。盤面の下（左カラム内）に置き、幅を盤面に合わせる。
            右カラムは設定専用。上のタブで牌の送り先と右パネルの内容が同時に決まる */}
        <div className="palette-dock">
          {/* 画面に出るタブ列はここだけ（右パネル側にタブバーを戻さないこと） */}
          <div className="palette-tabs" role="tablist">
            {tabList.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={`palette-tab${activeTab === t.key ? ' palette-tab--active' : ''}`}
                onClick={() => selectPaletteTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="palette-dock-status">{paletteStatus}</div>
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

      {/* ヘッダー：ID・問題タイプ・フラグ・保存を1行にまとめて縦の場所を節約する
          （スマホでは .editor の先頭に出しているのでここには置かない） */}
      {!isNarrow && headerRow}

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

      {/* === パレット統合エリア ===
          タブ列は左のパレット側へ一本化したので、ここは今どのパネルを見ているかの見出しだけ。
          タブバーをここへ戻さないこと（同じ操作の入口が2つになる） */}
      <section className="editor-section editor-section--palette">
        <div className="palette-panel-title">{PANEL_TITLES[activePanel] ?? ''}</div>

        {/* 手牌パネル（手牌・副露・出題注釈のタブから開く） */}
        {activePanel === 'hand' && (
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
            {/* 副露の種類はサブタブで選ぶ。押した時点で入力が始まる（＝選択中の牌はクリア） */}
            <MeldTypeTabs
              active={addingMeld?.target === 'hand' ? addingMeld.type : null}
              onSelect={startAddMeld}
            />
            {addingMeld?.target === 'hand' && (
              <MeldAddingPanel
                meld={addingMeld}
                // 副露タブは入力待ちのままなのが正しい状態なので、解除ではなく牌のクリアにする
                cancelLabel={paletteTab === 'meld' ? 'クリア' : 'キャンセル'}
                onCancel={() => setAddingMeld(
                  paletteTab === 'meld' ? newAddingMeld(addingMeld.type, 'hand') : null
                )}
                onRemoveTile={removeTileFromMeld}
                onChangeFrom={changeAddingMeldFrom}
              />
            )}

            {/* 注釈は手牌と一緒に書くことが多いのでこのパネルに置く（点数パネルには置かない）。
                盤面ロック中はこのパネル自体が出ないので、正解設定パネルに同じものを出す */}
            {noteEditor}
          </div>
        )}

        {/* ドラパネル（ドラタブ・盤面の王牌クリックから開く）。
            値の差し替えは下の牌パレットで行うので、ここは現在の値の確認だけ。
            ★ 盤面の王牌に出るのは**ドラ表示牌**（1つ前の牌）なので、取り違えないよう両方並べる */}
        {activePanel === 'dora' && (
          <div className="palette-tab-content">
            <div className="editor-section-label">いまのドラ</div>
            <div className="editor-dora-row">
              <span className="editor-current">ドラ</span>
              {/* 押しても何も起きない見本なので button（TileImg）ではなく span で描く */}
              <span className="tile-btn editor-tile editor-tile--static">
                <img src={getTileImageUrl(dora)} alt={dora} width={30} height={41} />
              </span>
              <span className="editor-current">王牌に出る表示牌</span>
              <span className="tile-btn editor-tile editor-tile--static">
                <img src={getTileImageUrl(getDoraIndicator(dora))} alt={getDoraIndicator(dora)} width={30} height={41} />
              </span>
            </div>
            <p className="editor-current">下の牌パレットをクリックするとドラが差し替わります。</p>
          </div>
        )}

        {/* 点数パネル（タブ列には無く、盤面の点数チップから開く）。
            ドラ・場風・局・自風・巡目は盤面の中央フィールドで直接設定するのでここには置かない
            （盤面を見ながら設定できるほうが速く、右カラムの縦の長さも抑えられる） */}
        {activePanel === 'jokyo' && (
          <div className="palette-tab-content">
            {/* 自風だけはスマホでもここから設定する。盤面の自風バッジは点数チップの中の
                小さいボタンなので、卓を縮小すると押しにくいため。
                局・本場・巡目は盤面中央のセレクタで足りるので出さない（入口を増やさない） */}
            {isNarrow && !boardLocked && (
              <label className="score-edit-jikaze">
                自風
                <select
                  className="editor-type-select"
                  value={jikaze ?? ''}
                  onChange={e => setJikaze(e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">—</option>
                  {SCORE_WINDS.map(w => (
                    <option key={w} value={w}>{w}家</option>
                  ))}
                </select>
              </label>
            )}
            <div className="editor-section-label">点数状況</div>
            {/* 点数は常に既定値（全員25000）が入る仕様なので「未設定」の選択肢は置かない */}
            {(() => {
              const total = SCORE_WINDS.reduce((sum, w) => sum + (scores[w] ?? 0), 0) + (scores.kyotaku ?? 0)
              const totalOk = total === 100000
              return (
                <div className="score-edit-area">
                  {/* スマホは一覧＋ポップアップ。ScoreInputRow の2段レイアウトは
                      右カラムの幅（500px）前提で、スマホでは横にはみ出すため */}
                  {isNarrow
                    ? [...SCORE_WINDS, 'kyotaku'].map(w => (
                        <button
                          key={w}
                          className={
                            'score-list-row' +
                            (jikaze === w ? ' score-list-row--self' : '') +
                            (activeScoreWind === w ? ' score-list-row--active' : '')
                          }
                          onClick={() => setScoreSheet(w)}
                        >
                          <span className="score-list-wind">
                            {w === 'kyotaku' ? '供託' : `${w}家`}
                            {jikaze === w && <span className="score-edit-self">自分</span>}
                          </span>
                          <span className="score-list-value">{(scores[w] ?? 0).toLocaleString()}</span>
                          <span className="score-list-caret">›</span>
                        </button>
                      ))
                    : (
                      <>
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
                      </>
                    )}
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

        {/* 捨て牌パネル（自分を含む各家の河。データ構造の都合で変数名は otherDiscards のまま） */}
        {activePanel === 'sutehai' && (
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
                      onClick={() => updateOtherDiscard(bi, clearDiscardTiles)}
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
                {/* 手牌の副露と同じサブタブ。こちらは揃った時点で解除して捨て牌の送り先へ戻る */}
                <MeldTypeTabs
                  active={addingMeld?.target === bi ? addingMeld.type : null}
                  onSelect={type => startAddOtherDiscardMeld(bi, type)}
                />
                {addingMeld?.target === bi && (
                  <MeldAddingPanel
                    meld={addingMeld}
                    onCancel={() => setAddingMeld(null)}
                    onRemoveTile={removeTileFromMeld}
                    onChangeFrom={changeAddingMeldFrom}
                  />
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
          </div>
        )}

        {/* 正解設定パネル（正解設定・解説に挿入のタブから開く） */}
        {activePanel === 'answer' && (
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

            {/* 盤面ロック中は手牌パネルが無いので、注釈をここに出す */}
            {boardLocked && noteEditor}
          </div>
        )}
      </section>

      {/* 保存・削除はヘッダー行に移したので、ここは保存時の警告だけ（無いときは行ごと出さない） */}
      {(otherDiscardIncomplete || otherDiscardDuplicatePlayer) && (
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
        </div>
      )}

      </div>{/* /editor-panel-scroll */}

      </div>{/* /editor-panel-col */}
      </div>{/* /editor-columns */}
    </div>
  )
}
