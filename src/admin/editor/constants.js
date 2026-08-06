import { getMeldFromOptions } from '../../utils/problemConstants'

export const TILE_GROUPS = [
  { label: '萬子', tiles: ['1m','2m','3m','4m','5m','0m','6m','7m','8m','9m'] },
  { label: '筒子', tiles: ['1p','2p','3p','4p','5p','0p','6p','7p','8p','9p'] },
  { label: '索子', tiles: ['1s','2s','3s','4s','5s','0s','6s','7s','8s','9s'] },
  { label: '字牌', tiles: ['1z','2z','3z','4z','5z','6z','7z'] },
]

// 牌パレットの送り先タブ。画面に出るタブ列はこれ1つだけで、押すと
// 「パレットの牌の送り先（mode）」と「右パネルに出す内容（panel）」が同時に決まる。
// boardOnly のタブは盤面ロック中（牌譜モード）に出さない。
// 出牌・選択肢はタブに出さず、問題タイプから自動的に選ばれる
// （ドラは盤面の王牌クリックだけだと気づけないので 2026-08-01 にタブへ出した）
// ★ dora タブでパレットから選ぶのは**ドラ表示牌**（王牌に出る牌）。ラベルもそう名乗る
export const PALETTE_TABS = [
  { key: 'hand',        label: '手牌',           panel: 'hand',    mode: 'hand',        boardOnly: true },
  { key: 'meld',        label: '副露',           panel: 'hand',    mode: 'meld',        boardOnly: true },
  { key: 'dora',        label: 'ドラ表示牌',     panel: 'dora',    mode: 'dora',        boardOnly: true },
  { key: 'sutehai',     label: '捨て牌',         panel: 'sutehai', mode: 'sutehai',     boardOnly: true },
  { key: 'answer',      label: '正解設定',       panel: 'answer',  mode: null },
  { key: 'note',        label: '出題注釈に挿入', panel: null,      mode: 'note' },
  { key: 'explanation', label: '解説に挿入',     panel: 'answer',  mode: 'explanation' },
]

// 右パネルの見出し（タブ列を左のパレットへ一本化したので、ここは現在地の目印だけ）
export const PANEL_TITLES = {
  hand:    '手牌',
  jokyo:   '点数',
  dora:    'ドラ表示牌',
  sutehai: '捨て牌',
  answer:  '正解設定',
}

// タブ → 右パネルに出す内容。
// 注釈欄の実体は手牌パネルにあるが、盤面ロック中は手牌パネルが無いので正解設定パネルへ出る。
// 'jokyo'（点数）はタブ列に無く盤面の点数チップから開くので、定義に無いキーはそのまま通す
export function panelOfTab(tab, locked) {
  if (tab === 'note') return locked ? 'answer' : 'hand'
  return PALETTE_TABS.find(t => t.key === tab)?.panel ?? tab
}

// 正解設定タブの送り先は問題タイプで決まる（鳴き系だけ専用の送り先がある）
export function answerPaletteMode(problemType) {
  if (problemType === 'naki-timing') return 'depai'
  if (problemType === 'naki-choice') return 'nakiChoice'
  return 'explanation'
}

// タブ → パレットの牌の送り先。タブを押したときと、前の問題から引き継いだタブで
// 開き直すときの両方で使う（送り先の導出を2箇所に書かないこと）
export function modeOfTab(tab, problemType, fallbackMode) {
  if (tab === 'answer') return answerPaletteMode(problemType)
  if (tab === 'jokyo')  return 'dora'
  return PALETTE_TABS.find(t => t.key === tab)?.mode ?? fallbackMode
}

// 副露を新規作成するときの鳴いた元（チーは上家固定・暗槓は無し）
export function defaultMeldFrom(type) {
  return getMeldFromOptions(type)[0] ?? null
}

// 副露の入力中データ。種類を切り替えるたびに作り直す＝選択中の牌はクリアされる
export function newAddingMeld(type, target) {
  return { type, tiles: [], target, from: defaultMeldFrom(type) }
}

export const SCORE_WINDS    = ['東', '南', '西', '北']
export const DEFAULT_SCORES = { 東: 25000, 南: 25000, 西: 25000, 北: 25000, kyotaku: 0 }
