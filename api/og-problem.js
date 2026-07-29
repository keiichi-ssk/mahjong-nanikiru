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
//   現在含まれているのは次の32字だけで、これ以外を書くと豆腐（□）になる:
//     0123456789ちってのるをチドメリルン一何切待清特色訓？
//   **局・巡目・点数を載せるには再サブセット化（fonttools）が要る**。

import { ImageResponse } from '@vercel/og';
import { decodeProblemParam } from '../src/utils/problemShare.js';
import { getTileImageUrl } from '../src/utils/tileUtils.js';
import { seatWinds } from '../src/utils/boardUtils.js';
import { getMeldTileRole } from '../src/utils/problemConstants.js';

export const config = { runtime: 'edge' };

// 手牌が無い（壊れたリンク）ときに出す代表例
const FALLBACK_HAND = ['1m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1z', '1z', '5z', '5z', '9m'];

// 牌の寸法。
// ★ 手牌は「手牌＋副露」を1行に収める必要がある。副露は鳴いた牌が横向きになるぶん
//   1組あたり牌の高さ（41px）を食うので、14枚のときより副露があるときの方が長くなる。
//   卓の内寸 540px に対する必要幅は次のとおりで、30×41 ならどれも収まる:
//     副露なし（手牌14）… 30×14 + gap        = 446
//     副露1組（手牌11）… 350 + 103 + gap10   = 463
//     副露2組（手牌8） … 254 + 212 + gap10   = 476
//     副露3組（手牌5） … 158 + 321 + gap10   = 489
//     副露4組（手牌2） … 62 + 430 + gap10    = 502
//   **サイズを変えるときはこの計算をやり直すこと**（satori は溢れても切ってくれない）
const RIVER = { w: 22, h: 30 };
const HAND  = { w: 30, h: 41 };
const WALL  = { w: 22, h: 30 };

const BOARD_SIZE  = 560;
const RIVER_COLS  = 6;
const RIVER_ROWS  = 3;   // カードに出す河は最大18枚（それ以上は切り詰める）

// 牌画像は SVG（テキスト）なので、URLエンコードした data URI にして埋め込む
// （Buffer を使わず Edge Runtime で完結させる）
async function tileDataUri(origin, tile) {
  const url = getTileImageUrl(tile);
  if (!url) return null;
  const res = await fetch(new URL(url, origin));
  return `data:image/svg+xml,${encodeURIComponent(await res.text())}`;
}

// ---- 描画の部品（satori に渡す要素ツリー）----

const tileNode = (src, size) => ({
  type: 'div',
  props: {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: size.w, height: size.h,
      background: '#fbfaf8', border: '2px solid #b8c0cc', borderRadius: 4,
    },
    children: src
      ? { type: 'img', props: { src, width: size.w - 6, height: size.h - 6 } }
      : null,
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

// 1家ぶんの河。6枚ずつ折り返す
const riverNode = srcs => ({
  type: 'div',
  props: {
    style: { display: 'flex', flexDirection: 'column', gap: 2 },
    children: Array.from({ length: RIVER_ROWS }, (_, row) =>
      srcs.slice(row * RIVER_COLS, row * RIVER_COLS + RIVER_COLS)
    )
      .filter(row => row.length > 0)
      .map(row => ({
        type: 'div',
        props: { style: { display: 'flex', gap: 2 }, children: row.map(s => tileNode(s, RIVER)) },
      })),
  },
});

// 自分の副露。鳴いた牌は横向き、暗槓の両端は裏向きにする
// （どの位置を横にするかは getMeldTileRole が唯一の実装。出題画面・管理画面と共通）。
// 副露が無いと手牌が11枚などになった理由が伝わらないので、カードにも出す
const meldNode = (meld, uriOf) => ({
  type: 'div',
  props: {
    style: { display: 'flex', alignItems: 'flex-end', gap: 1 },
    children: meld.tiles.map((tile, i) => {
      const role = getMeldTileRole(meld.type, i, meld.from);
      if (role === 'back') return backNode(HAND);
      if (role !== 'rotated') return tileNode(uriOf[tile], HAND);
      // 横向きの牌。回転しても占有サイズは変わらないので、外枠で縦横を入れ替える
      return {
        type: 'div',
        props: {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: HAND.h, height: HAND.w,
          },
          children: {
            type: 'div',
            props: {
              style: { display: 'flex', transform: 'rotate(90deg)' },
              children: tileNode(uriOf[tile], HAND),
            },
          },
        },
      };
    }),
  },
});

// 回転しても要素の占有サイズは変わらないので、外側に縦横を入れ替えたサイズを持たせて
// 内側を回す（BoardView の RotatedBlock と同じ考え方）
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
  const riverOf = wind => {
    if (!wind) return [];
    const od = discards.find(d => d.player === wind);
    return (od?.tiles ?? []).slice(0, RIVER_COLS * RIVER_ROWS);
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

  // 画像の取得はまとめて1回で（牌の重複ぶんは Map で1本化する）
  const meldTiles = melds.flatMap(m => m.tiles);
  const needed = [...new Set([...hand, ...meldTiles, ...Object.values(rivers).flat(), problem?.dora].filter(Boolean))];
  const [uriList, fontRegular, fontBold] = await Promise.all([
    Promise.all(needed.map(t => tileDataUri(origin, t))),
    fetch(new URL('/fonts/NotoSansJP-Regular.otf', origin)).then(r => r.arrayBuffer()),
    fetch(new URL('/fonts/NotoSansJP-Bold.otf', origin)).then(r => r.arrayBuffer()),
  ]);
  const uriOf = Object.fromEntries(needed.map((t, i) => [t, uriList[i]]));

  const riverW = RIVER_COLS * RIVER.w + (RIVER_COLS - 1) * 2;
  const riverH = RIVER_ROWS * RIVER.h + (RIVER_ROWS - 1) * 2;
  const river  = tiles => riverNode(tiles.map(t => uriOf[t]));

  // 中央：王牌（左端がドラ表示牌、残りは裏向き）
  const center = {
    type: 'div',
    props: {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 190, height: 190,
        background: 'rgba(0, 0, 0, 0.28)',
        border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 12,
      },
      children: {
        type: 'div',
        props: {
          style: { display: 'flex', gap: 3 },
          children: [
            tileNode(problem?.dora ? uriOf[problem.dora] : null, WALL),
            ...Array.from({ length: 4 }, () => backNode(WALL)),
          ],
        },
      },
    },
  };

  const board = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, width: BOARD_SIZE, height: BOARD_SIZE, borderRadius: 18, padding: 10,
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
            style: { display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 6 },
            children: [
              {
                type: 'div',
                props: { style: { display: 'flex', gap: 2 }, children: hand.map(t => tileNode(uriOf[t], HAND)) },
              },
              ...(melds.length > 0
                ? [{
                    type: 'div',
                    props: {
                      style: { display: 'flex', flexDirection: 'row-reverse', gap: 6 },
                      children: melds.map(m => meldNode(m, uriOf)),
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
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: 18 },
              children: [
                { type: 'div', props: { style: { fontSize: 78, fontWeight: 700, color: '#eceff4', display: 'flex' }, children: '何切る' } },
                { type: 'div', props: { style: { fontSize: 34, color: '#88c0d0', display: 'flex' }, children: '何を切る？' } },
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
