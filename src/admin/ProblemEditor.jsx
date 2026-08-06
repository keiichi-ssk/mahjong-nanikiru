import { useState, useEffect, useCallback, useRef } from 'react'
import { getTileLabel, sortTiles, getDoraIndicator, getDoraFromIndicator } from '../utils/tileUtils'
import { normalizeProblemType, parseAnswers } from '../utils/judgeUtils'
import { pruneAnswers } from '../utils/answerEdit'
import {
  MELD_TYPE_LABELS, MELD_TILE_COUNT, normalizeMelds, PROBLEM_TYPE_LABELS,
} from '../utils/problemConstants'
import { parseTileNotation } from '../utils/importBoard'
import { useIsNarrow } from '../utils/useMediaQuery'
import { questionImagePath, QUESTION_IMAGE_BUCKET } from '../utils/questionImage'
import { useDragReorder } from '../utils/useDragReorder'
import {
  emptyDiscardBlock, toDiscardBlock, addDiscardTile, removeDiscardTile,
  moveDiscardTile, toggleDiscardRiichi,
} from '../utils/discardEdit'
import QuestionImage from '../components/QuestionImage'
import ShareButton from '../components/ShareButton'
import { supabase } from '../lib/supabase'

import BoardView from './BoardView'
import ResponsiveBoard from '../components/ResponsiveBoard'

// 定数と表示部品は src/admin/editor/ に切り出してある。
// このファイルは state とパネルの組み立てに専念する（部品は props で完結させ、state を持たせない）
import {
  PALETTE_TABS, PANEL_TITLES, panelOfTab, modeOfTab, newAddingMeld,
  DEFAULT_SCORES,
} from './editor/constants'
import TilePalette from './editor/TilePalette'
import { ScoreSheet } from './editor/ScoreParts'
import { TextCount } from './editor/FormParts'
import HandPanel from './editor/panels/HandPanel'
import DoraPanel from './editor/panels/DoraPanel'
import ScorePanel from './editor/panels/ScorePanel'
import DiscardPanel from './editor/panels/DiscardPanel'
import AnswerPanel from './editor/panels/AnswerPanel'

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
//   makeImageFilename … 問題画像の保存名を作る関数 (ext) => string。渡さなければ <問題id>.<ext>。
//                  自作問題は id が保存時採番の uuid なので、id に依らない名前を渡してもらう
//   imageNote    … 画像欄の下に出す注意書き（自作問題では「共有には含まれない」ことを伝える）
//   initialPaletteTab / onPaletteTabChange …
//                  開いている送り先タブを呼び出し側に覚えさせるための組。問題を選び直すと
//                  この画面は key ごと作り直されるため、渡さないと毎回「手牌」に戻る。
//                  管理画面は続けて同じ作業（正解設定など）をすることが多いので前のタブで開く
export default function ProblemEditor({
  problem, prevProblem, onSave, onSaveAndNext, onDelete, hasNext,
  hideImage = false, hideReviewed = false, hideDelete = false, headerLead = null,
  saveStatus = null, lockBoard = false, concealedCounts = null,
  hideDisabled = false, paletteAside = null, textLimits = null, hideBoardView = false,
  onShare = null, saveLabel = '保存', hideSaveNext = false,
  initialPaletteTab = null, onPaletteTabChange = null,
  makeImageFilename = null, imageNote = null,
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
    // 公式問題は <id>.<ext>（id は DB 採番済み）。自作問題は保存するまで id が無いので、
    // 呼び出し側が id に依らない名前を作る（makeImageFilename）
    const filename = makeImageFilename ? makeImageFilename(ext) : `${problem.id}.${ext}`
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
    // ⚠️ setTiles の updater の中で setAnswer を呼ばないこと（StrictMode で2回走る）。
    //    次の手牌は updater の外で求める
    const next = tiles.filter((_, i) => i !== index)
    setTiles(next)
    // 手牌から消えた牌は正解リストからも外す（暗槓は4枚を切った時点で外れる）
    setAnswer(a => pruneAnswers(a, next))
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
    const next = sortTiles(parsed)
    setTiles(next)
    // 入れ替えた手牌に無い正解は落とす。残すと出題画面で選べない正解になり、
    // 管理画面でも手牌クリックで解除できなくなる（前問から引き継いだ正解で起きやすい）
    setAnswer(a => pruneAnswers(a, next))
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

  // 盤面ロック中は手牌タブが無いので正解設定から始める。
  // 呼び出し側が前に開いていたタブを覚えていれば、そのタブで開き直す（送り先もタブに合わせる）
  const initialTab = initialPaletteTab ?? (lockBoard ? 'answer' : 'hand')
  const [paletteTab,  setPaletteTab]  = useState(initialTab)
  const [paletteMode, setPaletteMode] = useState(
    () => modeOfTab(initialTab, problemType, lockBoard ? 'explanation' : 'hand')
  )

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
    setPaletteMode(modeOfTab(key, problemType, fallbackMode))
    // 次の問題を同じタブで開けるよう呼び出し側にも伝える
    onPaletteTabChange?.(key)
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
      // ★ パレットで選ぶのは**ドラ表示牌**（王牌に出る牌）。problem.dora は
      //   ドラそのものを持つので、1つ進めてから保存する（表示側は getDoraIndicator で戻す）
      case 'dora':        setDora(getDoraFromIndicator(tile)); break
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
      onPaletteTabChange?.('jokyo')
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
    // パレットで選ぶのは表示牌なので、選んだ牌と結果のドラを両方出す
    dora:        dora ? `ドラ表示牌: ${getTileLabel(getDoraIndicator(dora))} → ドラ: ${getTileLabel(dora)}` : 'ドラ: なし',
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
            {imageNote && <p className="editor-current editor-image-note">{imageNote}</p>}
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
          <HandPanel
            tiles={tiles} setTiles={setTiles}
            tilesInput={tilesInput} setTilesInput={setTilesInput} applyTilesText={applyTilesText}
            melds={melds} updateMeldFrom={updateMeldFrom} removeMeld={removeMeld}
            addingMeld={addingMeld} setAddingMeld={setAddingMeld} startAddMeld={startAddMeld}
            removeTileFromMeld={removeTileFromMeld} changeAddingMeldFrom={changeAddingMeldFrom}
            paletteTab={paletteTab} noteEditor={noteEditor}
          />
        )}

        {activePanel === 'dora' && <DoraPanel dora={dora} />}

        {activePanel === 'jokyo' && (
          <ScorePanel
            isNarrow={isNarrow} boardLocked={boardLocked}
            jikaze={jikaze} setJikaze={setJikaze}
            scores={scores} setScores={setScores}
            activeScoreWind={activeScoreWind} setScoreSheet={setScoreSheet}
          />
        )}

        {activePanel === 'sutehai' && (
          <DiscardPanel
            otherDiscards={otherDiscards} jikaze={jikaze}
            activeSutehaiIdx={activeSutehaiIdx} setSutehaiActiveIdx={setSutehaiActiveIdx}
            updateOtherDiscard={updateOtherDiscard}
            addOtherDiscardBlock={addOtherDiscardBlock}
            removeOtherDiscardBlock={removeOtherDiscardBlock}
            removeOtherDiscardTile={removeOtherDiscardTile}
            moveOtherDiscardTile={moveOtherDiscardTile}
            toggleOtherDiscardRiichi={toggleOtherDiscardRiichi}
            sutehaiDrag={sutehaiDrag} setSutehaiDrag={setSutehaiDrag}
            sutehaiDropIndex={sutehaiDropIndex} setSutehaiDropIndex={setSutehaiDropIndex}
            updateSutehaiDropIndex={updateSutehaiDropIndex}
            addingMeld={addingMeld} setAddingMeld={setAddingMeld}
            startAddOtherDiscardMeld={startAddOtherDiscardMeld}
            removeTileFromMeld={removeTileFromMeld}
            changeAddingMeldFrom={changeAddingMeldFrom}
            updateOtherDiscardMeldFrom={updateOtherDiscardMeldFrom}
            removeOtherDiscardMeld={removeOtherDiscardMeld}
            otherDiscardIncomplete={otherDiscardIncomplete}
            otherDiscardDuplicatePlayer={otherDiscardDuplicatePlayer}
          />
        )}

        {activePanel === 'answer' && (
          <AnswerPanel
            problemType={problemType}
            tiles={tiles} answerList={answerList} toggleAnswer={toggleAnswer}
            riichi={riichi} setRiichi={setRiichi}
            answer={answer} setAnswer={setAnswer}
            discardedTile={discardedTile} setDiscardedTile={setDiscardedTile}
            nakiChoices={nakiChoices}
            toggleNakiChoiceCorrect={toggleNakiChoiceCorrect}
            removeNakiChoice={removeNakiChoice}
            answerOrderRef={answerOrderRef}
            answerDragIndex={answerDragIndex} answerDropIndex={answerDropIndex}
            answerDragHandlers={answerDragHandlers}
            explanation={explanation} setExplanation={setExplanation}
            explanationRef={explanationRef} explanationTouchedRef={explanationTouchedRef}
            setPaletteMode={setPaletteMode}
            textLimits={textLimits} boardLocked={boardLocked} noteEditor={noteEditor}
          />
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
