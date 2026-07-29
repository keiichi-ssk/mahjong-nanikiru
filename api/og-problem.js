// 共有された自作問題のOGPカード画像（/api/og-problem?p=圧縮した問題）。
// api/share-q.js の og:image から参照される。p が無い／壊れている場合は代表例の手牌になる。
//
// Edge Runtime + @vercel/og（satori + resvg-wasm）。
// Edge Runtime には Node の fs が無いため、フォント・牌画像はいずれも fetch で取得する。
//
// ★★★ BoardView.jsx は流用できない ★★★
//   satori がサポートするのは CSS のごく一部で、盤面が土台にしている
//   display:grid（17箇所）・CSS変数（33箇所）・min()/calc()（10箇所）は**すべて非対応**。
//   そのためカード用の卓はこのファイルで flexbox と transform:rotate だけを使って別に組んである。
//   **React 版（BoardView）と見た目を一致させる義務は負わない**（同期しようとすると
//   盤面を触るたび2箇所直すことになる）。ここは「カード用の簡略な卓」と割り切ること。
//
// ★★ 文言を増やすときはフォントのサブセットを作り直すこと ★★
//   public/fonts/NotoSansJP-{Bold,Regular}.otf はカードで使う文字だけに絞ってある
//   （全字体は1書体17MBで、Vercel関数の同梱サイズ上限に触れる）。
//   現在含まれているのは次の62字だけで、これ以外を書くと豆腐（□）になる:
//     （半角空白）0123456789ちってのるをチドメリルン一何切待清特色訓？東南西北局本場巡目供託点,座学す麻雀問集自分で作|()myβ
//   作り直しは `bash scripts/subset-og-fonts.sh`（文字の追加もそのスクリプト内で行う）。

import { ImageResponse } from '@vercel/og';
import { decodeProblemParam } from '../src/utils/problemShare.js';
import { getTileImageUrl, getDoraIndicator } from '../src/utils/tileUtils.js';
import { seatWinds, collectCalledTiles, buildRiver } from '../src/utils/boardUtils.js';
import { getMeldTileRole } from '../src/utils/problemConstants.js';

export const config = { runtime: 'edge' };

// 手牌が無い（壊れたリンク）ときに出す代表例
const FALLBACK_HAND = ['1m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1z', '1z', '5z', '5z', '9m'];

// 牌の寸法。
// ★ 手牌は「手牌＋副露」を1行に収める必要がある。副露は鳴いた牌が横向きになるぶん
//   1組あたり牌の高さ（41px）を食うので、14枚のときより副露があるときの方が長くなる。
//   30×41 での必要幅は次のとおりで、卓の内寸 560px にほぼ収まる:
//     副露なし（手牌14）… 30×14 + gap          = 446
//     ポン4組（手牌2） … 62 + 103×4 + gap28    = 502
//     大明槓4組（手牌2）… 62 + 134×4 + gap28   = 626 ← ★収まらない
//   最後のような極端な形もURLに入れて送れてしまうので、**実際の幅を計算して
//   はみ出すぶんだけ牌を縮める**（handScale）。satori は溢れても切ってくれない
const RIVER = { w: 22, h: 30 };
const HAND  = { w: 30, h: 41 };
const WALL  = { w: 22, h: 30 };

const BOARD_SIZE  = 580;   // 卓。カード高 630 − 上下の帯 20 ＝ 610 に収まる大きさ
const BOARD_PAD   = 10;
const INNER_SIZE  = BOARD_SIZE - BOARD_PAD * 2;   // 560
const HAND_ROW_MAX = INNER_SIZE - 16;             // 手牌の行が卓の縁に張り付かないよう少し内側に収める
const CENTER_SIZE = 300;   // 中央フィールド（局・巡目・各家の風と点数を載せる）
const SEAT_SLOT   = 76;    // 中央の左右に置く「上家／下家」の枠。王牌を中央に保つため固定幅にする
const RIVER_COLS  = 6;
const RIVER_ROWS  = 3;   // カードに出す河は最大18枚（それ以上は切り詰める）

// 卓の縦の内訳（内寸 560）:
//   対面の河 94 ＋ 中央 300 ＋ 自分の河 94 ＋ 手牌 41 ＝ 529
//   残り 31px を justifyContent:'space-between' が3つの隙間に配る。
// ★ 河の枠は**実際の段数によらず常に3段ぶん（94px）を確保する**。
//   河の中身は枠の「中央フィールド側」に寄るので、1段でも3段でも卓の各パーツは動かない
//   （段数でレイアウトがずれると、問題ごとにカードの構図が変わってしまう）。

// 牌画像はカード専用の小さなPNG（public/tiles/card/*.png）を使う。
//
// ★ アプリ本体が使う public/tiles/*.svg を直接渡してはいけない。
//   あちらは1枚が最大60KBある詳細な図で、satori/resvg が**牌の種類ごとに**解析・ラスタライズする。
//   本番の実測で 1種類あたり約95ms かかり、23種類のカードで描画3.7秒のうち大半を占めていた
//   （取得は並列に効いていて0.05〜0.7秒しかかかっていない）。
//   カード上では最大 24×35px にしか描かれないので、あらかじめラスタライズした
//   48×70 のPNG（1枚2KB程度）に置き換えてある。
//   **生成は `node scripts/generate-card-tiles.mjs`。牌のSVGを描き替えたら作り直すこと。**
function cardTileUrl(tile) {
  const url = getTileImageUrl(tile);          // 例 /tiles/Man1.svg
  return url ? url.replace(/\/([^/]+)\.svg$/, '/card/$1.png') : null;
}

async function tileDataUri(origin, tile) {
  const url = cardTileUrl(tile);
  if (!url) return null;
  const res = await fetch(new URL(url, origin));
  // PNG を作り忘れている牌があってもカード全体を落とさない（その牌だけ白く描かれる）
  if (!res.ok) return null;
  // Buffer は使えない（Edge Runtime）ので btoa で base64 にする。1枚2KB程度なので問題ない
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(bin)}`;
}

// 3桁区切り（点数）。Intl に頼らず自前で入れる
const formatScore = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- 描画の部品（satori に渡す要素ツリー）----

// ★ lineHeight を明示すること。既定のままだと中央フィールドの5行が 300px に収まらず
//   一番下（自分の点数）が枠からはみ出す（実際に踏んだ）
const textNode = (text, style) => ({
  type: 'div',
  props: { style: { display: 'flex', lineHeight: 1.1, ...style }, children: text },
});

// 河の牌の「暗さ」は2段階あり、度合いで意味を分けている（アプリ側と同じルール）。
//   'tsumogiri' … ツモ切り（沈む）        アプリ: brightness(0.75)
//   'called'    … 鳴かれた牌（はっきり暗い） アプリ: brightness(0.45) saturate(0.7)
//
// ★ satori は CSS の filter に対応していないので、暗くする手段が2つある。
//   使い分けは意図的なので、**まとめて片方に寄せないこと**:
//
//   ツモ切り … 牌の上に黒い膜を重ねる（DIM_OVERLAY）。
//              **卓の色が透けないので「牌のまま暗い」**。河に並んでいることは
//              一目で分かるべきなので、こちらを使う（2026-07-30 変更）。
//              濃さは白い牌 255 に対し 255(1-a) = 255*b を解いて求める
//   鳴かれた牌 … 牌そのものを透かす（DIM_OPACITY）。卓に沈んで「もう無い」ように見えるのが狙い
//
// ★ アプリ側の brightness と片方だけ変えないこと
const DIM_OVERLAY = { tsumogiri: 'rgba(0, 0, 0, 0.25)' };   // brightness(0.75) 相当
const DIM_OPACITY = { called: 0.33 };                        // brightness(0.45) 相当

const tileNode = (src, size, dim = null) => ({
  type: 'div',
  props: {
    style: {
      position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: size.w, height: size.h,
      background: '#fbfaf8', border: '2px solid #b8c0cc', borderRadius: 4,
      ...(DIM_OPACITY[dim] ? { opacity: DIM_OPACITY[dim] } : {}),
    },
    children: [
      src ? { type: 'img', props: { src, width: size.w - 6, height: size.h - 6 } } : null,
      // 膜は牌の面いっぱい（枠線の内側）に敷く。border ぶん 2px×2 を引く
      DIM_OVERLAY[dim]
        ? {
            type: 'div',
            props: {
              style: {
                position: 'absolute', top: 0, left: 0,
                width: size.w - 4, height: size.h - 4,
                display: 'flex', borderRadius: 2,
                background: DIM_OVERLAY[dim],
              },
            },
          }
        : null,
    ].filter(Boolean),
  },
});

// 裏向きの牌（王牌用）。画像ではなく塗りで描く
const backNode = size => ({
  type: 'div',
  props: {
    style: {
      display: 'flex', width: size.w, height: size.h, borderRadius: 4,
      background: 'linear-gradient(160deg, #f5c842 0%, #d9a520 100%)',
    },
  },
});

// 1家ぶんの河。6枚ずつ折り返す。cells は { src, dim } の配列（dim は DIM_OPACITY のキー）
const riverNode = cells => ({
  type: 'div',
  props: {
    style: { display: 'flex', flexDirection: 'column', gap: 2 },
    children: Array.from({ length: RIVER_ROWS }, (_, row) =>
      cells.slice(row * RIVER_COLS, row * RIVER_COLS + RIVER_COLS)
    )
      .filter(row => row.length > 0)
      .map(row => ({
        type: 'div',
        props: {
          style: { display: 'flex', gap: 2 },
          children: row.map(c => tileNode(c.src, RIVER, c.dim)),
        },
      })),
  },
});

// 家の風と点数。自分だけ金色にして「どこが自分か」が一目で分かるようにする
const seatInfoNode = (wind, score, isSelf) => ({
  type: 'div',
  props: {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      color: isSelf ? '#f5c842' : '#dbe3ee',
    },
    children: [
      textNode(wind, { fontSize: 28, fontWeight: 700 }),
      ...(score == null
        ? []
        : [textNode(formatScore(score), { fontSize: 19, color: isSelf ? '#f0d489' : '#a9b8cc' })]),
    ],
  },
});

// 自分の副露。鳴いた牌は横向き、暗槓の両端は裏向きにする
// （どの位置を横にするかは getMeldTileRole が唯一の実装。出題画面・管理画面と共通）。
// 副露が無いと手牌が11枚などになった理由が伝わらないので、カードにも出す
const meldNode = (meld, uriOf, size) => ({
  type: 'div',
  props: {
    style: { display: 'flex', alignItems: 'flex-end', gap: 1 },
    children: meld.tiles.map((tile, i) => {
      const role = getMeldTileRole(meld.type, i, meld.from);
      if (role === 'back') return backNode(size);
      if (role !== 'rotated') return tileNode(uriOf[tile], size);
      // 横向きの牌。回転しても占有サイズは変わらないので、外枠で縦横を入れ替える
      return {
        type: 'div',
        props: {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: size.h, height: size.w,
          },
          children: {
            type: 'div',
            props: {
              style: { display: 'flex', transform: 'rotate(90deg)' },
              children: tileNode(uriOf[tile], size),
            },
          },
        },
      };
    }),
  },
});

// 「手牌＋副露」を1行に並べたときの幅。牌の間隔は縮めないので安全側（やや大きめ）に出る
const meldWidth = (meld, size) =>
  meld.tiles.reduce(
    (w, _, i) => w + (getMeldTileRole(meld.type, i, meld.from) === 'rotated' ? size.h : size.w),
    0,
  ) + (meld.tiles.length - 1);

const handRowWidth = (hand, melds, size) =>
  hand.length * size.w + Math.max(0, hand.length - 1) * 2
  + melds.reduce((w, m) => w + meldWidth(m, size), 0)
  + Math.max(0, melds.length - 1) * 6
  + (melds.length > 0 ? 10 : 0);

// 回転しても要素の占有サイズは変わらないので、外側に縦横を入れ替えたサイズを持たせて
// 内側を回す（BoardView の RotatedBlock と同じ考え方）。
// 内側の河は枠の先頭（＝回転後は中央フィールド側）に寄るので、段数が減っても中央から離れない
const rotatedNode = (angle, w, h, child) => ({
  type: 'div',
  props: {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: Math.abs(angle) === 90 ? h : w,
      height: Math.abs(angle) === 90 ? w : h,
    },
    children: {
      type: 'div',
      props: {
        style: { display: 'flex', width: w, height: h, transform: `rotate(${angle}deg)` },
        children: child,
      },
    },
  },
});

export default async function handler(req) {
  const { origin, searchParams } = new URL(req.url);

  const problem = await decodeProblemParam(searchParams.get('p'));
  const hand = problem?.tiles?.length ? problem.tiles : FALLBACK_HAND;

  // 席（上家・対面・下家）に河を割り当てる。自風が未設定なら風で引けないので河は出さない
  const jikaze = problem?.jikaze ?? null;
  const discards = problem?.otherDiscards ?? [];
  // 河は「牌＋暗さの種類」で持つ。
  // ★ 鳴かれた牌の判定は buildRiver / collectCalledTiles に任せる（盤面と同じ唯一の実装）。
  //   ここで独自に数え直すと、同じ牌が複数あるときの扱いが盤面とずれる
  const called = collectCalledTiles({
    jikaze,
    melds: problem?.melds ?? [],
    otherDiscards: discards,
  });
  const riverOf = wind => {
    if (!wind) return [];
    const od = discards.find(d => d.player === wind);
    // 河のデータが無い家は何も描かない。
    // ★ buildRiver は「データが無ければ巡目ぶんの裏向きで埋める」動きをするが、
    //   カードは裏向きの河を描かない方針なので、その分岐には入れない
    if (!od?.tiles?.length) return [];
    return buildRiver({
      tiles: (od?.tiles ?? []).slice(0, RIVER_COLS * RIVER_ROWS),
      tsumogiri: od?.tsumogiri ?? null,
      calledTiles: called[wind] ?? [],
    }).map(cell => ({
      tile: cell.tile,
      // 鳴かれた牌とツモ切りが重なったら鳴かれた側を優先する（盤面と同じ）
      dim: cell.called ? 'called' : cell.tsumogiri ? 'tsumogiri' : null,
    }));
  };
  const seats = seatWinds(jikaze);
  const rivers = {
    left:   riverOf(seats[0].wind),   // 上家
    across: riverOf(seats[1].wind),   // 対面
    right:  riverOf(seats[2].wind),   // 下家
    self:   riverOf(jikaze),
  };

  // 自分の副露。手牌が14枚に満たない理由がこれなので、省くと局面が読めなくなる
  const melds = problem?.melds ?? [];

  // 大明槓を4組並べるような極端な形は 30×41 のままだと卓からはみ出すので、その場合だけ縮める
  // （左右に少し余白が残るよう、内寸そのものではなく HAND_ROW_MAX に収める）
  const handScale = Math.min(1, HAND_ROW_MAX / handRowWidth(hand, melds, HAND));
  const handTile = { w: Math.floor(HAND.w * handScale), h: Math.floor(HAND.h * handScale) };

  // ★ problem.dora は「ドラそのもの」。卓に置くのは**ドラ表示牌**（1つ前の牌）なので必ず変換する
  const doraIndicator = getDoraIndicator(problem?.dora);

  // 画像の取得はまとめて1回で（牌の重複ぶんは Map で1本化する）
  const meldTiles = melds.flatMap(m => m.tiles);
  const riverTiles = Object.values(rivers).flat().map(c => c.tile);
  const needed = [...new Set([...hand, ...meldTiles, ...riverTiles, doraIndicator].filter(Boolean))];
  const [uriList, fontRegular, fontBold] = await Promise.all([
    Promise.all(needed.map(t => tileDataUri(origin, t))),
    fetch(new URL('/fonts/NotoSansJP-Regular.otf', origin)).then(r => r.arrayBuffer()),
    fetch(new URL('/fonts/NotoSansJP-Bold.otf', origin)).then(r => r.arrayBuffer()),
  ]);
  const uriOf = Object.fromEntries(needed.map((t, i) => [t, uriList[i]]));

  const riverW = RIVER_COLS * RIVER.w + (RIVER_COLS - 1) * 2;
  const riverH = RIVER_ROWS * RIVER.h + (RIVER_ROWS - 1) * 2;
  const river  = cells => riverNode(cells.map(c => ({ src: uriOf[c.tile], dim: c.dim })));

  // ---- 中央フィールド：各家の風と点数・王牌・局と巡目 ----
  const scores = problem?.scores ?? null;
  // 風が引けない（自風が未設定）ときは家の情報を出さない。枠だけは残して王牌を中央に保つ
  const seatSlot = (wind, isSelf = false) => ({
    type: 'div',
    props: {
      style: { display: 'flex', width: SEAT_SLOT, justifyContent: 'center' },
      children: wind ? seatInfoNode(wind, scores?.[wind] ?? null, isSelf) : null,
    },
  });

  // 局・本場は同じ行にまとめる（盤面ビューと同じ扱い。本場は1以上のときだけ）
  const kyokuText = problem?.bakaze
    ? (problem.kyoku ? `${problem.bakaze}${problem.kyoku}局` : `${problem.bakaze}場`)
    : null;
  const honbaText = problem?.honba > 0 ? `${problem.honba}本場` : null;
  const kyokuLine = [kyokuText, honbaText].filter(Boolean).join(' ');
  const junmeText = problem?.junme ? `${problem.junme}巡目` : null;
  const kyotakuText = scores?.kyotaku > 0 ? `供託 ${formatScore(scores.kyotaku)}点` : null;

  // 未設定のものは行ごと出さない（「—」が並ぶと卓が読みにくくなるため）
  const situationLines = [
    kyokuLine ? textNode(kyokuLine, { fontSize: 28, fontWeight: 700, color: '#eceff4' }) : null,
    junmeText ? textNode(junmeText, { fontSize: 22, color: '#b9c6d8' }) : null,
    kyotakuText ? textNode(kyotakuText, { fontSize: 18, color: '#88c0d0' }) : null,
  ].filter(Boolean);

  const center = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        width: CENTER_SIZE, height: CENTER_SIZE, padding: 10,
        background: 'rgba(0, 0, 0, 0.28)',
        border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 14,
      },
      children: [
        // 上辺＝対面
        seatSlot(seats[1].wind),
        // 中段＝上家 / 王牌（左端がドラ表示牌・残り4枚は裏向き） / 下家
        {
          type: 'div',
          props: {
            style: { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' },
            children: [
              seatSlot(seats[0].wind),
              {
                type: 'div',
                props: {
                  style: { display: 'flex', gap: 3 },
                  children: [
                    // ドラが未設定なら表向きの牌を出さない（白い牌が1枚だけ浮いて見えるため）
                    ...(doraIndicator ? [tileNode(uriOf[doraIndicator], WALL)] : [backNode(WALL)]),
                    ...Array.from({ length: 4 }, () => backNode(WALL)),
                  ],
                },
              },
              seatSlot(seats[2].wind),
            ],
          },
        },
        // 局・巡目・供託
        ...(situationLines.length > 0
          ? [{
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
                children: situationLines,
              },
            }]
          : []),
        // 下辺＝自分
        seatSlot(jikaze, true),
      ],
    },
  };

  // ---- 卓 ----
  // justifyContent:'space-between' で「対面の河＝上端 / 中央 / 自分の河 / 手牌＝下端」に張り付ける
  const board = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        width: BOARD_SIZE, height: BOARD_SIZE, borderRadius: 18, padding: BOARD_PAD,
        background: 'radial-gradient(120% 90% at 50% 42%, #1b4a78 0%, #0e2f52 55%, #061a2e 100%)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
      },
      children: [
        rotatedNode(180, riverW, riverH, river(rivers.across)),
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: 4 },
            children: [
              rotatedNode(90, riverW, riverH, river(rivers.left)),
              center,
              rotatedNode(-90, riverW, riverH, river(rivers.right)),
            ],
          },
        },
        rotatedNode(0, riverW, riverH, river(rivers.self)),
        // 手牌と副露は同じ行。副露は「最初の鳴きが右端」なので、データ順（鳴いた順）のまま
        // 右から並べる（row-reverse。出題画面・盤面と同じ並び順ルール）
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'flex-end', gap: 10 },
            children: [
              {
                type: 'div',
                props: { style: { display: 'flex', gap: 2 }, children: hand.map(t => tileNode(uriOf[t], handTile)) },
              },
              ...(melds.length > 0
                ? [{
                    type: 'div',
                    props: {
                      style: { display: 'flex', flexDirection: 'row-reverse', gap: 6 },
                      children: melds.map(m => meldNode(m, uriOf, handTile)),
                    },
                  }]
                : []),
            ],
          },
        },
      ],
    },
  };

  const image = new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: 1200, height: 630, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 44,
          background: 'linear-gradient(160deg, #2e3440 0%, #3b4252 70%, #434c5e 100%)',
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: '#88c0d0', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: '#88c0d0', display: 'flex' } } },
          board,
          // 右側はサイトの看板（Xアカウントのヘッダー左側と揃えてある）。
          // ★ 何切る専用の文言にしないこと —— このカードは自作問題の共有全般に使うため
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column' },
              children: [
                textNode('座学する麻雀', { fontSize: 62, fontWeight: 700, color: '#f0f4f8' }),
                // 金色の下線（ヘッダーと同じアクセント）
                { type: 'div', props: { style: { display: 'flex', width: 104, height: 5, marginTop: 16, borderRadius: 3, background: '#d9a520' } } },
                textNode('何切る問題集 | メンチン何切るドリル', { fontSize: 22, color: '#9fb2c9', marginTop: 26 }),
                textNode('自分で作る my問題集(β)', { fontSize: 22, color: '#9fb2c9', marginTop: 8 }),
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Noto Sans JP', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'Noto Sans JP', data: fontBold, weight: 700, style: 'normal' },
      ],
    },
  );
  // 同じ p なら常に同じ画像になるため長期キャッシュしてよい
  image.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return image;
}
