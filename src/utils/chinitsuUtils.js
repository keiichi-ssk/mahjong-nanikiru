// 清一色トレーニングモード用の判定エンジン(単一スーツ1〜9のみ・純粋関数)。
// 生成時にスーツ(m/p/s)を指定でき、判定側は手牌の1枚目からスーツを自動判別する
// (清一色なので手牌全体が同一スーツである前提)。内部計算はすべて数字(ランク)ベース。
// 毎回ランダム生成される手牌に対し、捨て牌選択後のテンパイ／ノーテンと待ち牌をその場で計算する。
// 通常形(4面子+雀頭)と七対子形のどちらのテンパイも判定できる。単一スーツのみのため国士無双は対象外。
//
// 正誤基準(2026-07-21確定): 「最も受け入れ枚数(山に残っている待ち牌の合計枚数)が
// 多くなる打牌を選び」かつ「その打牌に対する待ち牌を過不足なく選択できた」場合のみ正解。
// 受け入れが同点で並ぶ打牌が複数あってもよい(いずれを選んでも正解になり得る)。

import { sortTiles } from './tileUtils';

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function tileCode(rank, suit) {
  return `${rank}${suit}`;
}

function suitOf(hand) {
  return hand[0][1];
}

function rankOf(tile) {
  return parseInt(tile[0], 10);
}

function countsFromTiles(tiles) {
  const counts = Array(10).fill(0);
  for (const t of tiles) counts[rankOf(t)]++;
  return counts;
}

// counts から setsNeeded 個の面子(刻子 or 順子)に過不足なく分解できるか。
// 最小の残り牌は「自身の刻子」か「自身から始まる順子」にしかなり得ないため、
// その2択を再帰的に試すだけで全パターンを尽くせる
function canDecomposeSets(counts, setsNeeded) {
  if (setsNeeded === 0) {
    return RANKS.every(r => counts[r] === 0);
  }
  const i = RANKS.find(r => counts[r] > 0);
  if (i === undefined) return false;

  if (counts[i] >= 3) {
    const next = [...counts];
    next[i] -= 3;
    if (canDecomposeSets(next, setsNeeded - 1)) return true;
  }
  if (i <= 7 && counts[i + 1] > 0 && counts[i + 2] > 0) {
    const next = [...counts];
    next[i]--;
    next[i + 1]--;
    next[i + 2]--;
    if (canDecomposeSets(next, setsNeeded - 1)) return true;
  }
  return false;
}

// 14枚が完成形か(通常形: 雀頭+4面子 / 七対子形: 7つの異なる対子)
function isComplete14(counts) {
  for (const r of RANKS) {
    if (counts[r] >= 2) {
      const next = [...counts];
      next[r] -= 2;
      if (canDecomposeSets(next, 4)) return true;
    }
  }
  const vals = RANKS.map(r => counts[r]);
  const twos = vals.filter(c => c === 2).length;
  const zeros = vals.filter(c => c === 0).length;
  return twos === 7 && zeros === 2;
}

// 指定スーツの1〜9各4枚(計36枚)からランダムに14枚を抽出する
export function generateChinitsuHand(suit = 'p') {
  const deck = [];
  for (const r of RANKS) for (let i = 0; i < 4; i++) deck.push(tileCode(r, suit));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return sortTiles(deck.slice(0, 14));
}

// hand14 がそのまま完成形（アガリ）かどうか
export function isWinningHand(hand14) {
  return isComplete14(countsFromTiles(hand14));
}

// hand14 から discardedTile を1枚切った後の13枚を判定する。
// ukeire は待ち牌ごとの残り枚数(4 - 自分の手牌内の枚数)の合計。
// value は各待ち牌で上がった場合の役の高さ(簡易比較・後述)のうち最大のもの
export function analyzeDiscard(hand14, discardedTile) {
  const suit = suitOf(hand14);
  const counts13 = countsFromTiles(hand14);
  counts13[rankOf(discardedTile)]--;

  const waits = [];
  let ukeire = 0;
  let value = 0;
  let valueYaku = []; // value(最大打点)を実現する上がりの複合役キー
  for (const r of RANKS) {
    if (counts13[r] >= 4) continue; // 手牌に既に4枚あれば5枚目は存在しない
    const counts14 = [...counts13];
    counts14[r]++;
    if (isComplete14(counts14)) {
      waits.push(tileCode(r, suit));
      ukeire += 4 - counts13[r];
      const win = bestWin(counts13, r);
      if (win.value > value) { value = win.value; valueYaku = win.yaku; }
    }
  }
  return { isTenpai: waits.length > 0, waits, ukeire, value, valueYaku };
}

// 14枚の手牌に対し、あり得る全打牌候補(重複牌は1種類にまとめる)の中から
// 受け入れ枚数が最大の打牌を求める。isTenpai な打牌が1つも無ければ maxUkeire は 0 になる。
// 受け入れ枚数が同点で複数並ぶ場合は、その中で最も役の高い(value が最大の)打牌に絞り込む
export function computeBestDiscards(hand14) {
  const candidates = [...new Set(hand14)];
  const analysisByTile = new Map(candidates.map(t => [t, analyzeDiscard(hand14, t)]));
  const maxUkeire = Math.max(...candidates.map(t => analysisByTile.get(t).ukeire));
  const tiedTiles = candidates.filter(t => analysisByTile.get(t).ukeire === maxUkeire);
  const maxValue = Math.max(...tiedTiles.map(t => analysisByTile.get(t).value));
  const bestTiles = tiedTiles.filter(t => analysisByTile.get(t).value === maxValue);
  return { maxUkeire, bestTiles, analysisByTile };
}

// ===== 役の高さ判定(簡易比較。符・完全な点数計算は行わない) =====
// 対象役: 七対子・平和・一盃口/二盃口・一気通貫・對々和・三暗刻・純全帯幺九(チャンタ)。
// すべて清一色の手牌のため、これらの附加役の有無だけで打牌の優劣を比較する

const YAKU_VALUES = {
  chiitoitsu: 2,
  pinfu: 1,
  iipeikou: 1,
  ryanpeikou: 3,
  ittsuu: 2,
  toitoi: 2,
  sanankou: 2,
  junchan: 3,
};

// 表示用の役名（打点で不正解になったときに「最善の打牌に付く複合役」を示すために使う）
export const YAKU_NAMES = {
  chiitoitsu: '七対子',
  pinfu: '平和',
  iipeikou: '一盃口',
  ryanpeikou: '二盃口',
  ittsuu: '一気通貫',
  toitoi: '対々和',
  sanankou: '三暗刻',
  junchan: '純全帯幺九',
};

// counts から setsNeeded 個の面子を選ぶすべての組み合わせを列挙し、
// 選ばなかった残りの牌(remaining)とセットで返す(待ちの形を判定するために使う)
function enumerateSetCombos(counts, setsNeeded) {
  if (setsNeeded === 0) return [{ sets: [], remaining: counts }];
  const out = [];
  for (const r of RANKS) {
    if (counts[r] >= 3) {
      const next = [...counts];
      next[r] -= 3;
      for (const combo of enumerateSetCombos(next, setsNeeded - 1)) {
        out.push({ sets: [{ type: 'triplet', value: r }, ...combo.sets], remaining: combo.remaining });
      }
    }
    if (r <= 7 && counts[r] > 0 && counts[r + 1] > 0 && counts[r + 2] > 0) {
      const next = [...counts];
      next[r]--;
      next[r + 1]--;
      next[r + 2]--;
      for (const combo of enumerateSetCombos(next, setsNeeded - 1)) {
        out.push({ sets: [{ type: 'run', start: r }, ...combo.sets], remaining: combo.remaining });
      }
    }
  }
  return out;
}

// 順子は start===1 なら1を、start===7 なら9を含む(それ以外の順子は老頭牌を含まない)
function setHasTerminal(set) {
  return set.type === 'triplet' ? (set.value === 1 || set.value === 9) : (set.start === 1 || set.start === 7);
}

// 4面子+雀頭の完成形から、待ちの種類(waitKind)によらず決まる役を求める。
// { han: 合計飜(簡易), yaku: 役キーの配列 } を返す
function evaluateFinalHand(finalSets, pairRank) {
  const allRuns = finalSets.every(s => s.type === 'run');
  const allTriplets = finalSets.every(s => s.type === 'triplet');
  const tripletCount = finalSets.filter(s => s.type === 'triplet').length;

  const yaku = [];
  const add = (key) => yaku.push(key);
  if (allTriplets) add('toitoi');
  if (tripletCount >= 3) add('sanankou'); // ツモ前提のため刻子はすべて暗刻扱い

  if (allRuns) {
    const startCounts = {};
    finalSets.forEach(s => { startCounts[s.start] = (startCounts[s.start] ?? 0) + 1; });
    const pairGroups = Object.values(startCounts).filter(c => c >= 2).length;
    if (pairGroups >= 2) add('ryanpeikou');
    else if (pairGroups === 1) add('iipeikou');

    const starts = new Set(finalSets.map(s => s.start));
    if (starts.has(1) && starts.has(4) && starts.has(7)) add('ittsuu');
  }

  if (finalSets.every(setHasTerminal) && (pairRank === 1 || pairRank === 9)) {
    add('junchan');
  }

  const han = yaku.reduce((sum, key) => sum + YAKU_VALUES[key], 0);
  return { han, yaku };
}

// counts13(13枚)に牌 w を加えて上がった場合の、あり得る解釈の中で最も高い役を返す。
// { value: 合計飜(簡易), yaku: 役キーの配列 } を返す（符・点数までは計算しない簡易版。
// 国士無双は単一スーツのため対象外）
function bestWin(counts13, w) {
  let best = { value: 0, yaku: [] };
  const consider = (value, yaku) => { if (value > best.value) best = { value, yaku }; };

  // 七対子(6対子+1枚 → w で7組目の対子が完成)
  const withW = [...counts13];
  withW[w] += 1;
  const vals = RANKS.map(r => withW[r]);
  if (vals.filter(c => c === 2).length === 7 && vals.filter(c => c === 0).length === 2) {
    consider(YAKU_VALUES.chiitoitsu, ['chiitoitsu']);
  }

  // 通常形: 3組+対子+塔子(リャンメン/ペンチャン/カンチャン) または 3組+2対子(シャンポン)
  for (const { sets: base3, remaining } of enumerateSetCombos(counts13, 3)) {
    const nonzero = RANKS.filter(r => remaining[r] > 0);
    if (nonzero.length === 2) {
      const [x, y] = nonzero;
      if (remaining[x] === 2 && remaining[y] === 2 && (w === x || w === y)) {
        const pairRank = w === x ? y : x;
        const finalSets = [...base3, { type: 'triplet', value: w }];
        const { han, yaku } = evaluateFinalHand(finalSets, pairRank);
        consider(han, yaku);
      }
    } else if (nonzero.length === 3) {
      const pairRank = nonzero.find(r => remaining[r] === 2);
      const singles = nonzero.filter(r => remaining[r] === 1);
      if (pairRank !== undefined && singles.length === 2) {
        const [x, y] = singles[0] < singles[1] ? singles : [singles[1], singles[0]];
        const gap = y - x;
        let waitKind = null;
        let start = null;
        if (gap === 2 && w === x + 1) {
          waitKind = 'kanchan';
          start = x;
        } else if (gap === 1) {
          const lowOk = x - 1 >= 1, highOk = y + 1 <= 9;
          if (w === x - 1 && lowOk) { waitKind = lowOk && highOk ? 'ryanmen' : 'penchan'; start = x - 1; }
          else if (w === y + 1 && highOk) { waitKind = lowOk && highOk ? 'ryanmen' : 'penchan'; start = x; }
        }
        if (waitKind) {
          const finalSets = [...base3, { type: 'run', start }];
          const { han, yaku } = evaluateFinalHand(finalSets, pairRank);
          if (waitKind === 'ryanmen' && finalSets.every(s => s.type === 'run')) {
            consider(han + YAKU_VALUES.pinfu, [...yaku, 'pinfu']);
          } else {
            consider(han, yaku);
          }
        }
      }
    }
  }

  // 単騎待ち: 4組 + 単独牌(w)
  for (const { sets: base4, remaining } of enumerateSetCombos(counts13, 4)) {
    const nonzero = RANKS.filter(r => remaining[r] > 0);
    if (nonzero.length === 1 && remaining[nonzero[0]] === 1 && nonzero[0] === w) {
      const { han, yaku } = evaluateFinalHand(base4, w);
      consider(han, yaku);
    }
  }

  return best;
}

// ユーザーの回答(捨て牌 + 'tenpai'|'noten' の判断 + 待ち選択)が正解かどうか。
// 正解条件: ①受け入れ枚数が最大になる打牌を選んでいる ②その打牌に対するテンパイ/ノーテンの
// 判断と待ち牌選択(過不足なし)が正しい。①を満たさなければ②の内容によらず不正解
export function judgeChinitsu(hand14, discardedTile, judgment, selectedWaits) {
  const { bestTiles, analysisByTile } = computeBestDiscards(hand14);
  if (!bestTiles.includes(discardedTile)) return false;

  const analysis = analysisByTile.get(discardedTile);
  if (judgment === 'noten') return !analysis.isTenpai;
  if (judgment === 'tenpai') {
    if (!analysis.isTenpai) return false;
    const sel = selectedWaits instanceof Set ? selectedWaits : new Set(selectedWaits ?? []);
    return sel.size === analysis.waits.length && analysis.waits.every(w => sel.has(w));
  }
  return false;
}

// ユーザーの回答を評価し、解答パネル表示に必要な結果オブジェクトを組み立てる（純粋関数）。
// 練習モード・タイムアタックの両方がこれを呼ぶ（判定・結果生成の唯一の実装）。
// action: 'tsumo'（ツモ宣言）| 'noten'（ノーテン宣言）| 'tenpai'（切る牌+待ちを指定してテンパイ回答）
// 返り値の mode は 'agari' | 'missed-agari' | 'noten' | 'discard'。isCorrect が正誤。
export function evaluateAnswer(hand14, action, discardedTile, selectedWaits) {
  if (action === 'tsumo') {
    return { mode: 'agari', isCorrect: isWinningHand(hand14) };
  }
  // アガリの手で「ノーテン」「テンパイ回答」を選ぶのはアガリ見逃し＝不正解
  if (isWinningHand(hand14)) {
    return { mode: 'missed-agari', isCorrect: false };
  }

  const { maxUkeire, bestTiles, analysisByTile } = computeBestDiscards(hand14);

  if (action === 'noten') {
    return { mode: 'noten', isCorrect: maxUkeire === 0, maxUkeire, bestTiles };
  }

  // action === 'tenpai'
  const actualAnalysis = analyzeDiscard(hand14, discardedTile);
  const isCorrect = judgeChinitsu(hand14, discardedTile, 'tenpai', selectedWaits);
  // 最善の打牌ごとに、その打牌のときの待ちを対応づける（複数の最善打牌の待ちを合算しない）
  const bestDiscards = bestTiles.map(t => ({ tile: t, waits: sortTiles(analysisByTile.get(t).waits) }));

  // 打点で不正解になったケース: 受け入れ枚数は最大と同じだが、役(打点)が最善に届かず
  // bestTiles に入れなかった打牌を選んでいる。このとき最善の打牌に付く複合役を提示する
  const maxValue = Math.max(...bestTiles.map(t => analysisByTile.get(t).value));
  const isValueMiss = actualAnalysis.isTenpai
    && actualAnalysis.ukeire === maxUkeire
    && !bestTiles.includes(discardedTile)
    && actualAnalysis.value < maxValue;
  const bestYaku = isValueMiss
    ? [...new Set(bestTiles.flatMap(t => analysisByTile.get(t).valueYaku))].map(k => YAKU_NAMES[k])
    : [];

  return {
    mode: 'discard', isCorrect, maxUkeire, bestTiles, bestDiscards,
    actualAnalysis, waits: selectedWaits, isValueMiss, bestYaku,
  };
}
