// 天鳳形式（tenhou.net/6）の牌譜 → BoardSnapshot（utils/importBoard.js の中間形式）。
// DB / DOM に依存しない純粋関数（判定や変換をコンポーネントに書き戻さないこと）。
//
// 計画: docs/user-problems-plan.md の Phase 5
//
//   牌譜JSON ──replayRound──▶ BoardSnapshot ──snapshotToProblem──▶ problem オブジェクト
//
// 雀魂の牌譜も tools-local/majsoul-save-tenhou.user.js がこの形式に変換して保存するため、
// 雀魂と天鳳のどちらの牌譜もこの1つのアダプタで読める。
//
// ★ 天鳳形式は「局ごとの配牌＋ツモ／打牌の列」であって盤面のスナップショットではない。
//   ある巡目の盤面を得るには局の先頭から再生する必要がある（それが replayRound）。
//
// 牌譜1局の構造（要素17個）:
//   [0]  [局, 本場, 供託]   局は 0=東1 … 3=東4, 4=南1 …
//   [1]  開始時の点数 ×4
//   [2]  ドラ表示牌（カンドラがあれば増える）
//   [3]  裏ドラ表示牌
//   [4..15]  プレイヤー0〜3 の [配牌, ツモ列, 打牌列] ×4
//   [16] 結果
//
// ★ [4] からの4人ぶんは「席順（プレイヤー番号）」であって親から並ぶわけではない。
//   親は 局 % 4 のプレイヤーで、風は playerWind() で求める。

import { getDoraFromIndicator } from './tileUtils';
import { windAt } from './problemConstants';
import { makeBoardSnapshot, WINDS } from './importBoard';

// ツモ列の要素が文字列なら鳴き（チー・ポン・大明槓）、
// 打牌列の要素が文字列なら暗槓・加槓（自分の手番で行うため打牌の位置に来る）。
const MELD_TYPE_BY_SYMBOL = { c: 'chi', p: 'pon', m: 'kan', k: 'kakan', a: 'ankan' };

// 打牌列の 60 は「ツモ切り」＝直前に引いた牌をそのまま切ったという意味
const TSUMOGIRI = 60;

// ===== 牌番号の変換 =====

// 天鳳の牌番号 → 牌コード。11〜19=萬子 / 21〜29=筒子 / 31〜39=索子 / 41〜47=字牌。
// 51 / 52 / 53 は赤5（アプリでは 0m / 0p / 0s）
const SUIT_BY_TENS = { 1: 'm', 2: 'p', 3: 's', 4: 'z' };

export function parseTenhouTile(n) {
  const v = Number(n);
  if (!Number.isInteger(v)) return null;
  const tens = Math.floor(v / 10);
  const rank = v % 10;
  if (tens === 5) return rank >= 1 && rank <= 3 ? `0${SUIT_BY_TENS[rank]}` : null; // 51/52/53 = 赤5
  const suit = SUIT_BY_TENS[tens];
  if (!suit) return null;
  if (rank < 1 || rank > (suit === 'z' ? 7 : 9)) return null;
  return `${rank}${suit}`;
}

export function parseTenhouTiles(list) {
  return (list ?? []).map(parseTenhouTile).filter(Boolean);
}

// ===== 副露文字列 =====

/**
 * 副露文字列を解析する。例:
 *   'p181818' → 記号が先頭   = 上家から鳴いた
 *   '1111p11' → 記号が3番目  = 下家から鳴いた
 *   'c522324' → チー（上家からのみ）。52 = 赤5筒
 *   '4545k4545' → 加槓（元のポンの記号位置を保ったまま牌が4枚になる）
 *
 * ★ 鳴いた相手は「記号の位置」で表される（先頭=上家 / 中=対面 / 末尾=下家）。
 *   これはアプリ側の getMeldTileRole（横向きにする牌の位置）と同じ考え方。
 *   ただし加槓だけは元のポン（3枚）の位置で判断する（牌は4枚だが記号は動かない）。
 *
 * 返り値: { type, tiles, fromRelative, calledIndex }
 *   tiles        … 牌コードの配列（出現順。tiles[calledIndex] が鳴いた牌）
 *   fromRelative … '上家' | '対面' | '下家'（暗槓は null）
 */
export function parseMeldString(str) {
  const tokens = String(str ?? '').match(/\d{2}|[cpkma]/g) ?? [];
  const symbolIndex = tokens.findIndex(t => MELD_TYPE_BY_SYMBOL[t]);
  if (symbolIndex < 0) return null;

  const type = MELD_TYPE_BY_SYMBOL[tokens[symbolIndex]];
  const codes = tokens.filter(t => !MELD_TYPE_BY_SYMBOL[t]);
  const tiles = codes.map(parseTenhouTile);
  if (tiles.some(t => t === null)) return null;

  // 加槓は元のポン（3枚）としての位置で相手を決める
  const span = type === 'kakan' ? 3 : tiles.length;
  let fromRelative = null;
  if (type !== 'ankan') {
    fromRelative = symbolIndex === 0 ? '上家' : symbolIndex === span - 1 ? '下家' : '対面';
  }
  return { type, tiles, fromRelative, calledIndex: symbolIndex };
}

// ===== 局の情報 =====

// 局番号（0=東1 … 4=南1 …）を場風と局に分ける
export function splitKyoku(kyoku) {
  const n = Number(kyoku) || 0;
  return { bakaze: WINDS[Math.floor(n / 4)] ?? null, kyoku: (n % 4) + 1 };
}

// プレイヤー番号 → その局での風。親（局 % 4 のプレイヤー）が東になる
export function playerWind(playerIndex, kyoku) {
  return WINDS[(playerIndex - (Number(kyoku) % 4) + 4) % 4];
}

function windToPlayer(wind, kyoku) {
  const i = WINDS.indexOf(wind);
  return i < 0 ? -1 : (i + (Number(kyoku) % 4)) % 4;
}

/**
 * 局の一覧。局面選択UIの選択肢に使う。
 * 各要素: { index, label, bakaze, kyoku, honba, result }
 */
export function listRounds(paifu) {
  return (paifu?.log ?? []).map((round, index) => {
    const [kyokuNo = 0, honba = 0] = round?.[0] ?? [];
    const { bakaze, kyoku } = splitKyoku(kyokuNo);
    return {
      index,
      bakaze,
      kyoku,
      honba,
      label: `${bakaze ?? '?'}${kyoku}局${honba > 0 ? ` ${honba}本場` : ''}`,
      result: round?.[16]?.[0] ?? null,
    };
  });
}

// ===== 読み込めるかの判定 =====

// 1局ぶんの要素数。[局情報, 点数, ドラ, 裏ドラ] + 4人×[配牌, ツモ, 打牌] + 結果
const ROUND_LENGTH = 17;

/**
 * 読み込んだ JSON がこのアダプタで扱えるかを判定する。
 * 返り値 { ok: true } または { ok: false, reason: '理由' }（画面にそのまま出せる文言）。
 *
 * ★ 再生は4人麻雀を前提にしているので、3人麻雀の牌譜はここで弾く
 *   （3人麻雀は1局の要素数が 14 になり、席と風の対応も変わる）。
 */
export function validatePaifu(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, reason: '牌譜のJSONファイルではないようです' };
  }
  if (!Array.isArray(json.log) || json.log.length === 0) {
    return { ok: false, reason: '牌譜のデータ（log）が見つかりません' };
  }
  if (!Array.isArray(json.name) || json.name.length !== 4) {
    return { ok: false, reason: '4人麻雀の牌譜ではないようです（対応していません）' };
  }
  const bad = json.log.find(r => !Array.isArray(r) || r.length !== ROUND_LENGTH);
  if (bad) {
    return { ok: false, reason: '4人麻雀の牌譜ではないようです（対応していません）' };
  }
  return { ok: true };
}

/**
 * 牌譜から作った問題の既定のタイトル（例: '東1局 9巡目'）。
 * 巡目は打牌の回数ではなくツモ回数なので、replayRound の結果（snapshot.junme）を渡すこと。
 */
export function defaultProblemTitle(paifu, roundIndex, junme) {
  const round = listRounds(paifu)[roundIndex];
  if (!round) return '';
  return junme > 0 ? `${round.label} ${junme}巡目` : round.label;
}

// ===== 局の再生 =====

// 手牌から牌番号を1枚だけ取り除く。赤5（51）と通常の5（15）は別の牌として扱うため、
// 牌コードではなく★牌番号のまま★照合する（内部状態を数値で持っているのはこのため）
function removeTile(hand, code) {
  const i = hand.indexOf(code);
  if (i >= 0) hand.splice(i, 1);
}

// 副露文字列の牌のうち、鳴いた1枚（相手が捨てた牌）を除いた残りを手牌から取り除く
function consumeCalledTiles(hand, tokens, calledIndex) {
  tokens.forEach((code, i) => {
    if (i !== calledIndex) removeTile(hand, code);
  });
}

// 副露文字列から牌番号だけを取り出す（手牌の照合用。parseMeldString は牌コードを返す）
function meldCodes(str) {
  return (String(str ?? '').match(/\d{2}|[cpkma]/g) ?? [])
    .filter(t => !MELD_TYPE_BY_SYMBOL[t])
    .map(Number);
}

/**
 * 1局を最初から最後まで再生し、局面（ステップ）を並べて返す。
 * このモジュールの再生はここが唯一の実装で、listSteps / snapshotAt / replayRound は
 * すべてこの結果を読むだけ。**再生ロジックを2つに分けないこと**（必ずズレる）。
 *
 * ステップの種類（kind）:
 *   'tsumo'   … 牌を引いた直後 ＝ 打牌の直前（手牌14枚）。何切るを問える瞬間
 *   'call'    … 鳴いた直後 ＝ 打牌の直前。同じく何切るを問える
 *   'discard' … 牌を切った直後。**他家がここで鳴くか・押すかを問える瞬間**
 *
 * ★ 'tsumo' / 'call' は「打牌の直前」なので turn（その家の何回目の打牌か）を持つ。
 *   暗槓・加槓を挟んだ場合は嶺上牌を引いたあとに1つだけ積む（カンの前では積まない）。
 *
 * 返り値 { steps, meta } … 局が無ければ null
 */
function replayAll(paifu, roundIndex) {
  const round = paifu?.log?.[roundIndex];
  if (!round) return null;

  // ★ 天鳳形式の供託は「リーチ棒の本数」。このアプリの scores.kyotaku は「点数」なので
  //   1000倍する（1本 = 1000点）。ここを取り違えると供託が 1点 で保存される
  const [kyokuNo = 0, honba = 0, kyotakuSticks = 0] = round[0] ?? [];
  const meta = {
    kyokuNo,
    honba,
    kyotaku:        (Number(kyotakuSticks) || 0) * 1000,
    startScores:    round[1] ?? [],
    doraIndicators: round[2] ?? [],
  };

  // プレイヤーごとの [配牌, ツモ列, 打牌列]
  const seats = [0, 1, 2, 3].map(p => ({
    hand:        [...(round[4 + p * 3] ?? [])],   // 牌番号のまま保持する
    draws:       round[5 + p * 3] ?? [],
    discards:    round[6 + p * 3] ?? [],
    drawPtr:     0,
    discardPtr:  0,
    drawCount:   0,      // ツモ回数 ＝ 巡目（鳴きは数えない）
    discardCount: 0,     // 通常の打牌の回数（暗槓・加槓は数えない）
    melds:       [],
    river:       [],
    riichiIndex: null,
    lastDraw:    null,
  }));

  const windOf = p => playerWind(p, kyokuNo);
  const steps  = [];

  // その瞬間の全員の状態を控える。あとから任意のステップの盤面を作れるようにするため。
  // 1局は高々100手なのでコストは問題にならない
  function pushStep(player, kind, tile, extra = {}) {
    steps.push({
      index:  steps.length,
      player,
      wind:   windOf(player),
      kind,
      tile,                              // 牌コード（ツモ牌 / 鳴いた牌 / 切った牌）
      junme:  seats[player].drawCount,
      state:  seats.map(s => ({
        hand:        [...s.hand],
        melds:       [...s.melds],       // 要素は作ったあと書き換えないので浅くてよい
        river:       [...s.river],
        riichiIndex: s.riichiIndex,
        drawCount:   s.drawCount,
      })),
      ...extra,
    });
  }

  // 鳴きが入ると手番が飛ぶ。次にツモ／鳴きをする家を、
  // 「次の要素が鳴きで、その鳴き元が今の打牌者」かどうかで判定する
  function nextPlayer(current) {
    for (let q = 0; q < 4; q++) {
      if (q === current) continue;
      const d = seats[q].draws[seats[q].drawPtr];
      if (typeof d !== 'string') continue;
      const meld = parseMeldString(d);
      if (!meld?.fromRelative) continue;
      if (windToPlayer(windAt(windOf(q), meld.fromRelative), kyokuNo) === current) return q;
    }
    return (current + 1) % 4;
  }

  // 鳴き（他家から）。鳴いた牌以外を手牌から取り除く
  function applyCall(s, p, str) {
    const meld = parseMeldString(str);
    if (!meld) return;
    consumeCalledTiles(s.hand, meldCodes(str), meld.calledIndex);
    s.melds.push({
      type:  meld.type,
      tiles: meld.tiles,
      // BoardSnapshot は「誰から鳴いたか」を絶対風で持つ（importBoard 側で相対に直す）
      from:  meld.fromRelative ? windAt(windOf(p), meld.fromRelative) : null,
    });
  }

  // 暗槓・加槓（自分の手番）。加槓は既存のポンを置き換える
  function applySelfKan(s, str) {
    const meld = parseMeldString(str);
    if (!meld) return;
    if (meld.type === 'kakan') {
      const i = s.melds.findIndex(m => m.type === 'pon' && m.tiles[0] === meld.tiles[0]);
      const from = i >= 0 ? s.melds[i].from : null;   // 鳴いた相手は元のポンのまま
      const kan = { type: 'kakan', tiles: meld.tiles, from };
      if (i >= 0) s.melds[i] = kan;
      else s.melds.push(kan);
      removeTile(s.hand, meldCodes(str)[meld.calledIndex]); // 加えた1枚だけ手牌から
      return;
    }
    for (const code of meldCodes(str)) removeTile(s.hand, code);
    s.melds.push({ type: meld.type, tiles: meld.tiles, from: null });
  }

  let current = kyokuNo % 4;   // 親から開始
  // 牌譜が壊れていても止まるように上限を設ける（1局の打牌は多くても100手程度）
  for (let guard = 0; guard < 400; guard++) {
    const s = seats[current];

    // --- ツモ または 鳴き ---
    const drawn = s.draws[s.drawPtr];
    if (drawn === undefined) break;   // 牌譜の終わり
    s.drawPtr++;

    // 打牌の直前に積むステップの種類と牌（暗槓・加槓を挟むと嶺上ツモで上書きされる）
    let kind, kindTile;
    if (typeof drawn === 'string') {
      applyCall(s, current, drawn);
      const meld = parseMeldString(drawn);
      kind     = 'call';
      kindTile = meld ? meld.tiles[meld.calledIndex] ?? null : null;
    } else {
      s.hand.push(drawn);
      s.lastDraw = drawn;
      s.drawCount++;
      kind     = 'tsumo';
      kindTile = parseTenhouTile(drawn);
    }

    // --- 打牌（暗槓・加槓を挟むと嶺上ツモに戻る） ---
    let discarded = false;
    while (!discarded) {
      const raw = s.discards[s.discardPtr];
      if (raw === undefined) return { steps, meta };

      if (typeof raw === 'string' && !raw.startsWith('r')) {
        // 暗槓・加槓。処理して嶺上牌を引き、同じ手番で打牌へ戻る
        s.discardPtr++;
        applySelfKan(s, raw);
        const rinshan = s.draws[s.drawPtr];
        if (rinshan === undefined) return { steps, meta };
        s.drawPtr++;
        s.hand.push(rinshan);
        s.lastDraw = rinshan;
        s.drawCount++;
        kind     = 'tsumo';
        kindTile = parseTenhouTile(rinshan);
        continue;
      }

      const isRiichi = typeof raw === 'string';
      const tileNo   = isRiichi ? Number(raw.slice(1)) : Number(raw);
      const actual   = tileNo === TSUMOGIRI ? s.lastDraw : tileNo;
      const actualCode = parseTenhouTile(actual);

      // ここが「打牌の直前」＝手牌14枚の状態。
      // この後どの牌を切るかも持たせる（正解ではないが参考として画面に出せる）
      pushStep(current, kind, kindTile, {
        turn:         s.discardCount + 1,
        nextDiscard:  actualCode,
        nextRiichi:   isRiichi,
      });

      s.discardPtr++;
      s.discardCount++;
      if (isRiichi) s.riichiIndex = s.river.length;
      s.river.push(actual);
      removeTile(s.hand, actual);

      // 打牌の直後。他家から見れば「鳴くか・押すか」を問える瞬間
      pushStep(current, 'discard', actualCode, {
        riichi:      isRiichi,
        lastDiscard: { wind: windOf(current), tile: actualCode },
      });
      discarded = true;
    }

    current = nextPlayer(current);
  }
  return { steps, meta };
}

// ステップの状態から BoardSnapshot を作る。seat（どの席の視点か）はステップとは独立
function buildSnapshot(step, seat, meta) {
  const windOf = p => playerWind(p, meta.kyokuNo);
  return makeBoardSnapshot({
    ...splitKyoku(meta.kyokuNo),
    honba:   meta.honba,
    kyotaku: meta.kyotaku,
    junme:   step.state[seat].drawCount,
    jikaze:  windOf(seat),
    // 牌譜が持つのは★ドラ表示牌★。このアプリの dora はドラそのものなので1つ進める。
    // カンドラは problem が持てないので最初の1枚だけを採る
    dora:    getDoraFromIndicator(parseTenhouTile(meta.doraIndicators[0])),
    scores:  Object.fromEntries(
      [0, 1, 2, 3].map(p => [windOf(p), meta.startScores[p] ?? 0])
    ),
    seats: Object.fromEntries([0, 1, 2, 3].map(p => [windOf(p), {
      hand:        parseTenhouTiles(step.state[p].hand),
      melds:       step.state[p].melds,
      discards:    parseTenhouTiles(step.state[p].river),
      riichiIndex: step.state[p].riichiIndex,
    }])),
    // 直前に切られた牌。problem.discardedTile になり、鳴き系の問題タイプで使う
    lastDiscard: step.lastDiscard ?? null,
  });
}

// ステップから状態（内部用の重いデータ）を取り除いた、画面に渡してよい形
function publicStep(step) {
  const { state, ...rest } = step;   // eslint-disable-line no-unused-vars
  return rest;
}

/**
 * 局の局面（ステップ）を並べて返す。局面選択UIの選択肢に使う。
 * 各要素: { index, player, wind, kind, tile, junme, turn?, nextDiscard?, riichi? }
 */
export function listSteps(paifu, roundIndex) {
  return (replayAll(paifu, roundIndex)?.steps ?? []).map(publicStep);
}

/**
 * 指定した局面の盤面を返す。
 *
 * @param stepIndex  listSteps のインデックス
 * @param seat       どの席の視点で見るか（0〜3）。**ステップの player とは独立**
 *
 * 返り値 { snapshot, step, actualDiscard, riichiDeclared } … 見つからなければ null。
 *   actualDiscard  … 打牌直前のステップで「この後実際に切られる牌」。
 *                    **正解ではない**が、正解を決めるときの参考に画面へ出せる
 */
export function snapshotAt(paifu, roundIndex, stepIndex, { seat = 0 } = {}) {
  const all = replayAll(paifu, roundIndex);
  const step = all?.steps?.[stepIndex];
  if (!step) return null;
  return {
    snapshot:       buildSnapshot(step, seat, all.meta),
    step:           publicStep(step),
    actualDiscard:  step.nextDiscard ?? null,
    riichiDeclared: step.nextRiichi ?? false,
  };
}

/**
 * 指定した席が turn 回目の打牌をする「直前」の盤面を返す。
 * ＝ その席が牌を引き終えた 14 枚の状態。何切る問題を作る最短路。
 *
 * 中身は snapshotAt を呼ぶだけ（再生は replayAll に一本化してある）。
 * 返り値は snapshotAt に isLast（その席の最後の打牌か）を足したもの。
 */
export function replayRound(paifu, roundIndex, { seat = 0, turn = 1 } = {}) {
  const all = replayAll(paifu, roundIndex);
  if (!all) return null;
  // 暗槓・加槓を挟むと同じ turn の打牌直前が複数あり得るため、最後（実際に切る直前）を採る
  const index = all.steps.findLastIndex(
    s => s.player === seat && s.turn === turn && (s.kind === 'tsumo' || s.kind === 'call')
  );
  if (index < 0) return null;
  return {
    ...snapshotAt(paifu, roundIndex, index, { seat }),
    isLast: turn >= countTurns(paifu, roundIndex, seat),
  };
}

/**
 * ある席がその局で何回打牌したか（＝選べる巡目の数）。局面選択UIの上限に使う。
 * 暗槓・加槓は打牌ではないので数えない。
 */
export function countTurns(paifu, roundIndex, seat) {
  const list = paifu?.log?.[roundIndex]?.[6 + seat * 3] ?? [];
  return list.filter(el => typeof el !== 'string' || el.startsWith('r')).length;
}

// ===== 局面の絞り込み（画面から使う） =====

// 既定は「自分の手番」＝ 何切るを作る使い方（ツモ・鳴きの直後）。
// 「他家の打牌」は鳴くか・押すかを問う局面（切られた牌が discardedTile に入る）
export const STEP_FILTERS = [
  { value: 'self',  label: '自分の手番' },
  { value: 'other', label: '他家の打牌' },
  { value: 'all',   label: 'すべて' },
];

// 絞り込みに合うステップだけを取り出す
export function filterSteps(steps, filter, seat) {
  if (filter === 'self')  return steps.filter(s => s.player === seat && s.kind !== 'discard');
  if (filter === 'other') return steps.filter(s => s.player !== seat && s.kind === 'discard');
  return steps;
}

// ステップ1つぶんの説明（「9巡目 ツモ」「南家 打」など）
export function stepLabel(step, seat) {
  if (!step) return '';
  const who = step.player === seat ? '自分' : `${step.wind}家`;
  if (step.kind === 'discard') return `${who} 打`;
  return `${step.junme}巡目 ${step.kind === 'call' ? '鳴き' : 'ツモ'}`;
}
