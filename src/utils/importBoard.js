// 盤面インポート層。外部データ（牌姿テキスト・牌譜など）から
// アプリ内の problem オブジェクトを組み立てるための変換を集めた層。
// DB / DOM に依存しない純粋関数だけを置く（判定や変換をコンポーネントに書き戻さないこと）。
//
// 計画: docs/user-problems-plan.md の Phase 4
//
//   外部データ ──各アダプタ──▶ BoardSnapshot ──snapshotToProblem──▶ problem オブジェクト
//
// 入力元ごとに problem の組み立てを書くと同じロジックが重複するため、
// 中間形式（BoardSnapshot）を1つ決めて、入力元ごとにアダプタだけを差し替える。
//
// ★ BoardSnapshot は「アプリ側から見た盤面の素の姿」であって、牌譜フォーマットの写しではない。
//   牌譜ごとの方言はアダプタ側で吸収し、この形には持ち込まないこと。

// ★ 相対 import に .js を付けているのは、このファイルが api/ 配下からも読まれるため
//   （Node の ESM は拡張子を補わない。付け忘れると本番の API だけ 500 になる）
import { sortTiles } from './tileUtils.js';
import { normalizeMelds, relativeWind } from './problemConstants.js';

// 席は東南西北の4つ。BoardSnapshot は「誰が自分か」に依存せず絶対風で持つ
export const WINDS = ['東', '南', '西', '北'];

// 自風が指定されないときの既定値（ProblemEditor の初期値と揃えてある）
const DEFAULT_JIKAZE = '南';

// 数牌の 0 は赤5。字牌に 0 / 8 / 9 は存在しない
const VALID_RANKS = { m: '0123456789', p: '0123456789', s: '0123456789', z: '1234567' };

/**
 * 牌姿テキストを牌コードの配列にする。
 * 「数字が並んだあとにスーツ文字が来たら、そこまでの数字すべてにそのスーツを付ける」方式。
 *
 *   '23467m234p' → ['2m','3m','4m','6m','7m','2p','3p','4p']
 *
 * 認識できない文字（空白・記号・全角など）は読み飛ばす。存在しない牌（8z など）は捨てる
 * ＝ 牌画像を持たない牌が手牌に混ざらないようにする。
 * スーツ文字が来ないまま終わった数字も捨てる（'234' だけではスーツが決まらないため）。
 */
export function parseTileNotation(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  let buf = [];
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      buf.push(ch);
    } else if (VALID_RANKS[ch]) {
      for (const rank of buf) {
        if (VALID_RANKS[ch].includes(rank)) out.push(rank + ch);
      }
      buf = [];
    }
  }
  return out;
}

// 1家ぶんの空の席。
//   hand        … その家の手牌
//   melds       … その家の副露。from は「誰から鳴いたか」を★絶対風★で持つ（暗槓は null）
//   discards    … その家の河（捨てた順）
//   riichiIndex … リーチ宣言牌の位置（discards のインデックス。無ければ null）
export function makeEmptySeat() {
  // tsumogiri は discards と同じ長さの boolean 配列（true＝ツモ切り）。
  // ★ 既定は null ＝「分からない」。空配列にすると「全部手出し」と読めてしまい、
  //   牌譜以外から作った盤面に誤った情報が付く
  return { hand: [], melds: [], discards: [], tsumogiri: null, riichiIndex: null };
}

/**
 * BoardSnapshot を作る。渡されなかった項目は「未設定」（null / 空配列）で埋める。
 * アダプタは分かるところだけ渡せばよい。
 */
export function makeBoardSnapshot(partial = {}) {
  return {
    bakaze:  partial.bakaze  ?? null,
    kyoku:   partial.kyoku   ?? null,
    honba:   partial.honba   ?? null,
    junme:   partial.junme   ?? null,
    jikaze:  partial.jikaze  ?? null,
    dora:    partial.dora    ?? null,
    // 供託（1000 = リーチ棒1本）。problem 側では scores の中に入る
    kyotaku: partial.kyotaku ?? null,
    // 各家の持ち点 { 東, 南, 西, 北 }。未設定なら null
    scores:  partial.scores  ?? null,
    // 直前に切られた牌 { wind, tile }。problem.discardedTile になり、
    // 「この牌を鳴くか」を問う問題タイプ（naki-timing / naki-choice）で使う。
    // 何切るの局面（自分のツモ番）では null
    lastDiscard: partial.lastDiscard ?? null,
    seats: Object.fromEntries(
      WINDS.map(w => [w, { ...makeEmptySeat(), ...(partial.seats?.[w] ?? {}) }])
    ),
  };
}

// 副露の「鳴いた元」を絶対風から相対位置（上家/対面/下家）へ直す。
// BoardSnapshot は絶対風で持つ（牌譜から取れるのがその形）のに対し、
// problem.melds は鳴いた家から見た相対位置で持つ（自風を変えても関係が保たれるため）。
// 変換は problemConstants の relativeWind が唯一の実装。
// 変換できない場合（自風が未設定・暗槓・不正値）は normalizeMelds が既定値へ矯正する。
function toProblemMelds(melds, ownerWind) {
  return normalizeMelds((melds ?? []).map(meld => ({
    ...meld,
    tiles: meld?.tiles ?? [],
    from:  relativeWind(ownerWind, meld?.from),
  })));
}

// problem.scores は各家の持ち点と供託を1つのオブジェクトにまとめた形。
// 持ち点も供託も無いなら「未設定」として null にする（出題画面が点数表示を出さない）。
function toProblemScores(snapshot) {
  if (!snapshot.scores && snapshot.kyotaku == null) return null;
  const base = snapshot.scores ?? {};
  return {
    ...Object.fromEntries(WINDS.map(w => [w, base[w] ?? 0])),
    kyotaku: snapshot.kyotaku ?? 0,
  };
}

// problem.otherDiscards は自分を含む最大4人ぶんの配列。
// 保存の規約は ProblemEditor の buildSaveData と同じで、
// 「家と捨て牌の両方が揃う」ブロックだけを残し、0件なら null にする
// （副露しかない家は保存しない ＝ 出題画面が家と牌の両方が無いと表示しないため）。
//
// 自分（家＝自風）のブロックは河だけを持たせ、副露は入れない。
// 自分の副露を持つのは problem.melds だけで、盤面もそちらしか見ない（BoardView）。
// 両方に入れると collectCalledTiles が鳴かれた牌を二重に数えてしまう。
// ツモ切りフラグを河の枚数にそろえる。**唯一の実装**（読み込み・保存・共有すべてここを通す）。
// null（分からない）はそのまま null で返し、「全部手出し」に化けさせない
export function normalizeTsumogiri(flags, length) {
  if (!Array.isArray(flags)) return null;
  return Array.from({ length }, (_, i) => flags[i] === true);
}

function toOtherDiscards(snapshot) {
  const blocks = WINDS
    .filter(wind => (snapshot.seats[wind].discards ?? []).length > 0)
    .map(wind => {
      const seat = snapshot.seats[wind];
      return {
        player:      wind,
        tiles:       [...seat.discards],
        // 分からない（牌譜以外から作った盤面）なら null のまま。
        // 長さがずれると牌とフラグの対応が壊れるので、河に合わせて切り詰め／不足は false で埋める
        tsumogiri:   normalizeTsumogiri(seat.tsumogiri, seat.discards.length),
        riichiIndex: seat.riichiIndex ?? null,
        melds:       wind === snapshot.jikaze ? [] : toProblemMelds(seat.melds, wind),
      };
    });
  return blocks.length > 0 ? blocks : null;
}

/**
 * BoardSnapshot → problem オブジェクト（ProblemEditor / ProblemView が扱う形）。
 *
 * 正解・解説・問題タイプは盤面には含まれない情報なので**この関数は作らない**。
 * インポート後に作成画面で人が設定する前提（docs/user-problems-plan.md 8-6）。
 */
export function snapshotToProblem(snapshot) {
  const s = makeBoardSnapshot(snapshot);
  // 自風の席が「自分」。未設定なら手牌の持ち主を決められないので空になる
  const self = s.jikaze ? s.seats[s.jikaze] : null;
  return {
    tiles:         sortTiles(self?.hand ?? []),
    melds:         toProblemMelds(self?.melds, s.jikaze),
    dora:          s.dora,
    bakaze:        s.bakaze,
    kyoku:         s.kyoku,
    honba:         s.honba,
    jikaze:        s.jikaze,
    junme:         s.junme,
    scores:        toProblemScores(s),
    otherDiscards: toOtherDiscards(s),
    // 鳴き系の問題タイプが使う「鳴く対象の牌」。何切るの局面では null になる
    discardedTile: s.lastDiscard?.tile ?? null,
  };
}

/**
 * 牌姿テキストから最小の BoardSnapshot を作るアダプタ。
 * 手牌だけを入れ、状況設定は options でそのまま渡せる（{ bakaze, kyoku, junme, dora, ... }）。
 *
 *   snapshotFromHandText('23467m234p234888s', { jikaze: '東', junme: 9 })
 */
export function snapshotFromHandText(text, options = {}) {
  const jikaze = options.jikaze ?? DEFAULT_JIKAZE;
  return makeBoardSnapshot({
    ...options,
    jikaze,
    seats: { ...options.seats, [jikaze]: { ...options.seats?.[jikaze], hand: parseTileNotation(text) } },
  });
}
