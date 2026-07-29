// 自作問題を「URLに丸ごと埋め込んで」共有する（純粋関数・DB/DOM 非依存）。
//
// メンチンドリルのシェア（chinitsuShare.js）は手牌14枚を数字14桁で表せたが、
// 自作問題は盤面まるごと（副露・各家の河・点数・解説）を運ぶ必要がある。
// そのため次の3段で圧縮する:
//
//   1. 短縮キー化   … {tiles:[...]} → {t:"..."}。牌コードは1文字に置き換える（'1m' → 'b'）
//   2. deflate-raw  … 解説などの日本語は URL エンコードで1文字9バイトに膨らむため圧縮が要る
//   3. base64url    … URL にそのまま置ける文字だけにする
//
// 実測（河が3行まで伸びた終盤・解説60字の最大ケース）で URL 全長 530 字。
// 手で作った河なしの問題なら 216 字程度に収まる。
//
// ★ 受け取る側は「他人が書き換えたかもしれない文字列」として扱うこと。
//   decodeProblemParam は構造の妥当性（牌コード・枚数・問題タイプ・風）を検証し、
//   ひとつでも壊れていれば null を返す。意味の妥当性（正解が手牌にあるか等）までは見ない
//   ——それは出題側が壊れずに描画できるかとは別の話で、作者の自由でもあるため。
//
// ★ CompressionStream / DecompressionStream を使うので encode / decode とも非同期。
//   ブラウザ標準（Safari 16.4+）で、Vercel の Edge Runtime にもあるので依存は増やさない。

// api/ 配下（Vercel Functions）からも読み込まれるため拡張子を明示する
// （他の src/utils は慣例で省略のまま。chinitsuShare.js と同じ扱い）
import { MELD_TILE_COUNT, MELD_FROMS, PROBLEM_TYPE_LABELS } from './problemConstants.js';
import { SITE_URL } from '../config/site.js';

// ===== 牌コード ⇔ 1文字 =====
// 数牌は 0（赤5）〜9 の10通り × 3スーツ、字牌は 1z〜7z。合わせて37種類。
// 並び順が変わると過去に配ったURLが別の牌に化けるので、**この順序を変えないこと**
const TILE_CODES = [];
for (const suit of ['m', 'p', 's']) {
  for (let n = 0; n <= 9; n++) TILE_CODES.push(`${n}${suit}`);
}
for (let n = 1; n <= 7; n++) TILE_CODES.push(`${n}z`);

// URL に入れても安全で、base64 の対象にもなる文字だけを使う
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-';

const TILE_TO_CHAR = Object.fromEntries(TILE_CODES.map((t, i) => [t, CHARS[i]]));
const CHAR_TO_TILE = Object.fromEntries(TILE_CODES.map((t, i) => [CHARS[i], t]));

// ===== 受け取る側の上限 =====
// ?p= は他人が書き換えられるので、描画が破綻しない範囲に必ず収めること。
// どれも「麻雀として成立する最大」より緩く、正当な問題が弾かれることはない
const MAX_PARAM_LENGTH   = 4000;   // URLパラメータそのものの長さ
const MAX_DECODED_LENGTH = 20000;  // 展開後のJSON（正当な最大ケースで約1200字）
const MAX_MELDS          = 4;      // 副露は4組まで（ルール上の上限）
const MAX_SEATS          = 4;      // 河は4家ぶんまで
const MAX_RIVER_TILES    = 30;     // 1家の河（実際は流局まで打っても24枚程度）
const MAX_NAKI_CHOICES   = 20;     // 鳴き選択の候補
const MAX_TEXT_LENGTH    = 1000;   // 解説・注釈・タイトル（DB側の上限は200字）

const WINDS = ['東', '南', '西', '北'];
const BAKAZE = ['東', '南', '西'];
const PROBLEM_TYPES = Object.keys(PROBLEM_TYPE_LABELS);
// 副露の種類も1文字にする（chi/pon/kan/kakan/ankan → c/p/k/K/a）。
// kan と kakan は先頭が同じなので大文字で分ける
const MELD_TYPE_TO_CHAR = { chi: 'c', pon: 'p', kan: 'k', kakan: 'K', ankan: 'a' };
const CHAR_TO_MELD_TYPE = Object.fromEntries(
  Object.entries(MELD_TYPE_TO_CHAR).map(([k, v]) => [v, k])
);
// 鳴いた元も1文字（上家/対面/下家 → 1/2/3。暗槓は null なので空文字）
const FROM_TO_CHAR = { 上家: '1', 対面: '2', 下家: '3' };
const CHAR_TO_FROM = { 1: '上家', 2: '対面', 3: '下家' };

const encTile  = t => TILE_TO_CHAR[t] ?? '';
const encTiles = a => (Array.isArray(a) ? a : []).map(encTile).join('');

// 1文字ずつ牌コードに戻す。未知の文字が混ざっていれば null（＝URLが壊れている）
function decTiles(s) {
  if (typeof s !== 'string') return null;
  const out = [];
  for (const ch of s) {
    const tile = CHAR_TO_TILE[ch];
    if (!tile) return null;
    out.push(tile);
  }
  return out;
}

// ===== 副露 =====
// 1組を "種類1文字 + 牌 + 鳴いた元1文字" で表す（例: ポン1z×3を上家から → "pLLL1"）
function encMeld(m) {
  return MELD_TYPE_TO_CHAR[m.type] + encTiles(m.tiles) + (FROM_TO_CHAR[m.from] ?? '');
}

function decMeld(s) {
  if (typeof s !== 'string' || s.length < 2) return null;
  const type = CHAR_TO_MELD_TYPE[s[0]];
  if (!type) return null;
  const count = MELD_TILE_COUNT[type];
  const tiles = decTiles(s.slice(1, 1 + count));
  if (!tiles || tiles.length !== count) return null;
  const rest = s.slice(1 + count);
  // 暗槓は鳴いた元を持たない。それ以外は1文字あるはず（無ければ既定値を後段で補う）
  const from = rest === '' ? null : CHAR_TO_FROM[rest];
  if (rest !== '' && !from) return null;
  if (type === 'ankan') return { type, tiles, from: null };
  return { type, tiles, from: from ?? MELD_FROMS[0] };
}

const encMelds = a => (Array.isArray(a) ? a : []).map(encMeld);

function decMelds(a) {
  if (a == null) return [];
  if (!Array.isArray(a) || a.length > MAX_MELDS) return null;
  const out = [];
  for (const s of a) {
    const m = decMeld(s);
    if (!m) return null;
    out.push(m);
  }
  return out;
}

// ===== 各家の河 =====
// "家|捨て牌|リーチ宣言牌の位置|副露をカンマ区切り" の1行にする
function encOtherDiscard(od) {
  return [
    od.player ?? '',
    encTiles(od.tiles),
    od.riichiIndex == null ? '' : String(od.riichiIndex),
    encMelds(od.melds).join(','),
  ].join('|');
}

function decOtherDiscard(s) {
  if (typeof s !== 'string') return null;
  const [player, tilesStr, riichiStr, meldsStr] = s.split('|');
  if (!WINDS.includes(player)) return null;
  const tiles = decTiles(tilesStr ?? '');
  if (!tiles || tiles.length > MAX_RIVER_TILES) return null;
  const riichiIndex = riichiStr === '' || riichiStr == null ? null : Number(riichiStr);
  if (riichiIndex != null && (!Number.isInteger(riichiIndex) || riichiIndex < 0)) return null;
  const melds = decMelds(meldsStr ? meldsStr.split(',') : []);
  if (!melds) return null;
  return { player, tiles, riichiIndex, melds };
}

// ===== 点数 =====
const encScores = s =>
  s ? [s.東 ?? 0, s.南 ?? 0, s.西 ?? 0, s.北 ?? 0, s.kyotaku ?? 0].join(',') : null;

function decScores(s) {
  if (s == null) return null;
  if (typeof s !== 'string') return undefined;   // undefined = 壊れている
  const parts = s.split(',').map(Number);
  if (parts.length !== 5 || parts.some(n => !Number.isFinite(n))) return undefined;
  const [東, 南, 西, 北, kyotaku] = parts;
  return { 東, 南, 西, 北, kyotaku };
}

// ===== 鳴き選択の候補 =====
const encNakiChoices = a =>
  (Array.isArray(a) ? a : []).map(c => encTile(c.tile) + (c.correct ? '1' : '0'));

function decNakiChoices(a) {
  if (a == null) return [];
  if (!Array.isArray(a) || a.length > MAX_NAKI_CHOICES) return null;
  const out = [];
  for (const s of a) {
    if (typeof s !== 'string' || s.length !== 2) return null;
    const tile = CHAR_TO_TILE[s[0]];
    if (!tile || (s[1] !== '0' && s[1] !== '1')) return null;
    out.push({ tile, correct: s[1] === '1' });
  }
  return out;
}

// ===== 圧縮 =====

// ★ writer 側の Promise は必ず握りつぶすこと。
//   壊れたデータを渡すと writable / readable の両方が reject し、writer 側を捨てていると
//   「未処理の Promise 拒否」としてテストランナーやブラウザのコンソールに漏れる
//   （エラー自体は readable 側の await で表に出るので、こちらは無視してよい）。
function pump(stream, bytes) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).then(() => writer.close()).catch(() => {});
}

async function deflate(str) {
  const stream = new CompressionStream('deflate-raw');
  pump(stream, new TextEncoder().encode(str));
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function inflate(bytes) {
  const stream = new DecompressionStream('deflate-raw');
  pump(stream, bytes);
  return new TextDecoder().decode(await new Response(stream.readable).arrayBuffer());
}

// base64url（+/ を -_ に、末尾の = を落とす）。btoa/atob はブラウザにも Edge にもある
function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ===== 本体 =====

/**
 * 問題 → URL パラメータ（base64url の文字列）。
 * 出題に必要なものだけを運ぶ。id・カテゴリ・正誤記録は含めない（受け取る側に意味がないため）
 */
export async function encodeProblemParam(problem) {
  const compact = {
    t: encTiles(problem.tiles),
    a: problem.answer ?? '',
    d: encTile(problem.dora),
    r: problem.riichi ?? null,
    y: problem.problemType ?? 'default',
    c: encTile(problem.discardedTile),
    z: encNakiChoices(problem.nakiChoices),
    m: encMelds(problem.melds),
    b: problem.bakaze ?? null,
    k: problem.kyoku ?? null,
    h: problem.honba ?? null,
    j: problem.jikaze ?? null,
    u: problem.junme ?? null,
    o: (problem.otherDiscards ?? []).map(encOtherDiscard),
    s: encScores(problem.scores),
    e: problem.explanation ?? '',
    n: problem.note ?? '',
    i: problem.title ?? '',
  };
  return toBase64Url(await deflate(JSON.stringify(compact)));
}

/**
 * URL パラメータ → 問題。壊れていれば null。
 *
 * 返るのは「アプリ内の problem オブジェクト」と同じ形で、
 * isUserProblem: true を付けて盤面表示にする（共有されるのは自作問題だけのため）。
 */
export async function decodeProblemParam(param) {
  if (typeof param !== 'string' || param.length === 0 || param.length > MAX_PARAM_LENGTH) return null;
  if (!/^[A-Za-z0-9\-_]+$/.test(param)) return null;

  let c;
  try {
    const json = await inflate(fromBase64Url(param));
    // ★ 展開後のサイズを必ず見ること。deflate は同じ文字の繰り返しを極端に縮めるので、
    //   4000字のURLからでも数MBのJSONを作れてしまう（いわゆる zip bomb）。
    //   正当な問題は最大でも1200字ほどなので、この上限で困ることはない
    if (json.length > MAX_DECODED_LENGTH) return null;
    c = JSON.parse(json);
  } catch {
    return null;   // base64・zlib・JSON のどれが壊れていてもここに来る
  }
  if (!c || typeof c !== 'object') return null;

  const tiles = decTiles(c.t ?? '');
  if (!tiles || tiles.length > 14) return null;

  const problemType = c.y ?? 'default';
  if (!PROBLEM_TYPES.includes(problemType)) return null;

  const melds = decMelds(c.m);
  if (!melds) return null;

  const nakiChoices = decNakiChoices(c.z);
  if (!nakiChoices) return null;

  const scores = decScores(c.s);
  if (scores === undefined) return null;

  // 河は家ごとに1行。壊れた行が混ざっていれば全体を無効にする
  let otherDiscards = null;
  if (c.o != null) {
    if (!Array.isArray(c.o) || c.o.length > MAX_SEATS) return null;
    const list = [];
    for (const line of c.o) {
      const od = decOtherDiscard(line);
      if (!od) return null;
      list.push(od);
    }
    otherDiscards = list.length > 0 ? list : null;
  }

  const dora = c.d ? CHAR_TO_TILE[c.d] : null;
  if (c.d && !dora) return null;
  const discardedTile = c.c ? CHAR_TO_TILE[c.c] : null;
  if (c.c && !discardedTile) return null;

  // 状況設定は範囲だけ見る（未設定は null のまま通す）
  const bakaze = c.b ?? null;
  if (bakaze != null && !BAKAZE.includes(bakaze)) return null;
  const jikaze = c.j ?? null;
  if (jikaze != null && !WINDS.includes(jikaze)) return null;
  const kyoku = c.k ?? null;
  if (kyoku != null && !(Number.isInteger(kyoku) && kyoku >= 1 && kyoku <= 4)) return null;
  const honba = c.h ?? null;
  if (honba != null && !(Number.isInteger(honba) && honba >= 0 && honba <= 99)) return null;
  const junme = c.u ?? null;
  if (junme != null && !(Number.isInteger(junme) && junme >= 1 && junme <= 30)) return null;

  // 解説・注釈・タイトルは中身を検証しない（作者の自由入力で、React が描画時にエスケープする）。
  // ただし長さだけは切る——画面が壊れるほど長いものを他人に送りつけられないようにするため
  const text = v => (typeof v === 'string' ? v.slice(0, MAX_TEXT_LENGTH) : '');
  const riichi = c.r === true || c.r === false ? c.r : null;

  return {
    // 共有された問題は DB に無いので、画面のキーには固定値を使う
    id: 'shared',
    isUserProblem: true,
    title: text(c.i),
    tiles,
    answer: text(c.a),
    dora,
    riichi,
    problemType,
    discardedTile,
    nakiChoices,
    melds,
    bakaze,
    kyoku,
    honba,
    jikaze,
    junme,
    otherDiscards,
    scores: scores ?? null,
    explanation: text(c.e),
    note: text(c.n),
    // 自作問題に画像は付かない（作成画面で hideImage）ので運ばない
    questionImageUrl: null,
    disabled: false,
  };
}

// Xに渡すリンク先。手牌ごとのOGPカードを出す中継ページ（api/share-q.js が実装）で、
// クローラーにはカード付きHTMLを返し、人間だけ share.html へ自動遷移させる
const SHARE_REDIRECT_URL = `${SITE_URL}/api/share-q`;

/**
 * X（旧Twitter）の投稿画面を開くURL。
 *
 * ★ 投稿文にネタバレ（正解・解説）を書かないこと。URL の中には入っているが、
 *   タイムラインに答えが並ぶと問題として成立しなくなる。
 * ★ タイトルは共有元がつけた自由入力なので、投稿文に入れるのは可（Xのフォントで出る）。
 *   ただしOGPカードには載せない——カードのフォントはサブセット化されており、
 *   任意の文字を描くと豆腐になるため（api/og-problem.js のコメント参照）
 */
export async function buildProblemShareUrl(problem) {
  const text = [
    '【何切る】',
    problem?.title ? problem.title : null,
    '',
    '何を切る？',
    '',
    '#麻雀 #何切る #座学する麻雀',
  ].filter(line => line !== null).join('\n');
  const shareUrl = `${SHARE_REDIRECT_URL}?p=${await encodeProblemParam(problem)}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
}

// 副露の種類が増えたら1文字マップにも足すこと（problemShare.test.js が検出する）
export const SHARE_INTERNALS = { TILE_CODES, MELD_TYPE_TO_CHAR };
