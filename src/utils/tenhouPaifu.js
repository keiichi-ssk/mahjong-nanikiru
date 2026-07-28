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
 * 1局を先頭から再生し、指定した席が turn 回目の打牌をする「直前」の盤面を返す。
 * ＝ その席が牌を引き終えた 14 枚の状態。何切る問題にするのはこの瞬間。
 *
 * @param paifu       天鳳形式の牌譜オブジェクト
 * @param roundIndex  paifu.log のインデックス
 * @param seat        席（プレイヤー番号 0〜3）。paifu.name と同じ並び
 * @param turn        その席の何回目の打牌の直前か（1始まり）
 *
 * 返り値 { snapshot, actualDiscard, riichiDeclared, isLast } … 見つからなければ null。
 *   actualDiscard  … 実際に切られた牌。**正解ではない**が、正解を決めるときの参考に画面へ出せる
 *   riichiDeclared … その打牌がリーチ宣言だったか
 *   isLast         … その席の最後の打牌か（次の巡目が無い＝UIで「次へ」を無効にできる）
 */
export function replayRound(paifu, roundIndex, { seat = 0, turn = 1 } = {}) {
  const round = paifu?.log?.[roundIndex];
  if (!round) return null;

  // ★ 天鳳形式の供託は「リーチ棒の本数」。このアプリの scores.kyotaku は「点数」なので
  //   1000倍する（1本 = 1000点）。ここを取り違えると供託が 1点 で保存される
  const [kyokuNo = 0, honba = 0, kyotakuSticks = 0] = round[0] ?? [];
  const kyotaku = (Number(kyotakuSticks) || 0) * 1000;
  const startScores = round[1] ?? [];
  const doraIndicators = round[2] ?? [];

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

  function buildResult(s, rawDiscard) {
    const snapshot = makeBoardSnapshot({
      ...splitKyoku(kyokuNo),
      honba,
      kyotaku,
      junme:  s.drawCount,
      jikaze: windOf(seat),
      // 牌譜が持つのは★ドラ表示牌★。このアプリの dora はドラそのものなので1つ進める。
      // カンドラは problem が持てないので最初の1枚だけを採る
      dora:   getDoraFromIndicator(parseTenhouTile(doraIndicators[0])),
      scores: Object.fromEntries(
        [0, 1, 2, 3].map(p => [windOf(p), startScores[p] ?? 0])
      ),
      seats: Object.fromEntries([0, 1, 2, 3].map(p => [windOf(p), {
        hand:        parseTenhouTiles(seats[p].hand),
        melds:       seats[p].melds,
        discards:    parseTenhouTiles(seats[p].river),
        riichiIndex: seats[p].riichiIndex,
      }])),
    });
    const riichiDeclared = typeof rawDiscard === 'string' && rawDiscard.startsWith('r');
    const tile = riichiDeclared ? Number(rawDiscard.slice(1)) : Number(rawDiscard);
    return {
      snapshot,
      actualDiscard: parseTenhouTile(tile === TSUMOGIRI ? s.lastDraw : tile),
      riichiDeclared,
      isLast: s.discardPtr >= s.discards.length - 1,
    };
  }

  let current = kyokuNo % 4;   // 親から開始
  // 牌譜が壊れていても止まるように上限を設ける（1局の打牌は多くても100手程度）
  for (let guard = 0; guard < 400; guard++) {
    const s = seats[current];

    // --- ツモ または 鳴き ---
    const drawn = s.draws[s.drawPtr];
    if (drawn === undefined) return null;
    s.drawPtr++;
    if (typeof drawn === 'string') applyCall(s, current, drawn);
    else {
      s.hand.push(drawn);
      s.lastDraw = drawn;
      s.drawCount++;
    }

    // --- 打牌（暗槓・加槓を挟むと嶺上ツモに戻る） ---
    let discarded = false;
    while (!discarded) {
      const raw = s.discards[s.discardPtr];
      if (raw === undefined) return null;

      if (typeof raw === 'string' && !raw.startsWith('r')) {
        // 暗槓・加槓。処理して嶺上牌を引き、同じ手番で打牌へ戻る
        s.discardPtr++;
        applySelfKan(s, raw);
        const rinshan = s.draws[s.drawPtr];
        if (rinshan === undefined) return null;
        s.drawPtr++;
        s.hand.push(rinshan);
        s.lastDraw = rinshan;
        s.drawCount++;
        continue;
      }

      // ここが「打牌の直前」＝手牌14枚の状態
      if (current === seat && s.discardCount === turn - 1) return buildResult(s, raw);

      s.discardPtr++;
      s.discardCount++;
      const isRiichi = typeof raw === 'string';
      const tile = isRiichi ? Number(raw.slice(1)) : Number(raw);
      const actual = tile === TSUMOGIRI ? s.lastDraw : tile;
      if (isRiichi) s.riichiIndex = s.river.length;
      s.river.push(actual);
      removeTile(s.hand, actual);
      discarded = true;
    }

    current = nextPlayer(current);
  }
  return null;
}

/**
 * ある席がその局で何回打牌したか（＝選べる巡目の数）。局面選択UIのスライダー上限に使う。
 * 暗槓・加槓は打牌ではないので数えない。
 */
export function countTurns(paifu, roundIndex, seat) {
  const list = paifu?.log?.[roundIndex]?.[6 + seat * 3] ?? [];
  return list.filter(el => typeof el !== 'string' || el.startsWith('r')).length;
}
