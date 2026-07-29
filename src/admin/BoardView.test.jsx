// 盤面ビューの描画スモークテスト。
// 盤面は「巡目・副露・鳴かれた牌」から表示を組み立てるため入力の欠けに弱い。
// 未設定だらけのデータでも落ちないことをここで固定する（組み立てロジック自体の検証は boardUtils.test.js）。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BoardView from './BoardView';
import { replayRound } from '../utils/tenhouPaifu';
import { snapshotToProblem } from '../utils/importBoard';
import paifu from '../utils/__fixtures__/tenhou-sample.json';

const base = {
  tiles: ['1m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1z', '1z', '5z', '5z'],
  melds: [{ type: 'pon', tiles: ['5z', '5z', '5z'], from: '対面' }],
  dora: '1m',
  answerList: ['5z'],
  bakaze: '東',
  kyoku: 1,
  jikaze: '南',
  junme: 7,
  scores: { 東: 25000, 南: 31200, 西: 18800, 北: 24000, kyotaku: 1000 },
  otherDiscards: [
    {
      player: '西',
      tiles: ['1z', '9m', '5p'],
      riichiIndex: 1,
      melds: [{ type: 'chi', tiles: ['3m', '4m', '5m'], from: '上家' }],
    },
  ],
  activeArea: 'hand',
  onSelectArea: () => {},
};

// 河の裏向きの牌だけを数える。裏向きは画像ではなく CSS で描いているのでクラス名で数えるが、
// 王牌・他家の手牌にも裏向きがあるので、河の目印（board-river-cell）と併せて判定する
const riverBacks = html => (html.match(/class="[^"]*"/g) ?? [])
  .filter(c => c.includes('board-tile--back') && c.includes('board-river-cell'))
  .length;

describe('BoardView', () => {

  it('場風・局・本場・巡目は盤面上のセレクタで設定する（場風と局は1つ）', () => {
    const html = renderToStaticMarkup(<BoardView {...base} />);
    for (const title of ['場風・局', '本場', '巡目']) {
      expect(html).toContain(`title="${title}"`);
    }
    // 現在値が選択されている（東1局・巡目7）
    expect(html).toContain('value="東1" selected');
    expect(html).toContain('value="7" selected');
    expect(html).toContain('巡目</option>');
    expect(html).toContain('供託');
  });

  it('自風はセレクタではなく自分の風バッジのクリックで変える', () => {
    const html = renderToStaticMarkup(<BoardView {...base} onChangeJikaze={() => {}} />);
    expect(html).not.toContain('title="自風"');
    expect(html).toContain('title="クリックで自風を変更（他家の風も連動）"');
  });

  it('自分の河は「巡目＋自分の副露数」枚になり、鳴かれた1枚を除いて裏向きになる', () => {
    // 他家3人ぶんのデータを入れて、裏向きが出るのを自分の河だけにする
    const html = renderToStaticMarkup(
      <BoardView
        {...base}
        otherDiscards={[
          ...base.otherDiscards,
          { player: '東', tiles: ['1p'], riichiIndex: null, melds: [] },
          { player: '北', tiles: ['2p'], riichiIndex: null, melds: [] },
        ]}
      />
    );
    // 巡目7 + 自分の副露1 = 8枚。うち1枚は西にチーされた牌なので表向き＋網掛け
    expect(riverBacks(html)).toBe(7);
  });

  it('捨て牌データが無い他家の河も裏向きで表示される', () => {
    // 自風が南なので 上家=東 / 対面=北 / 下家=西。データがあるのは西だけ。
    // 東と北は巡目ぶんの7枚（北は自分にポンされた1枚も裏向きのまま網掛けになる）、自分は7枚
    expect(riverBacks(renderToStaticMarkup(<BoardView {...base} />))).toBe(7 + 7 + 7);
  });

  it('鳴かれた牌が暗く表示される（西の上家＝南＝自分から鳴かれたチー）', () => {
    const html = renderToStaticMarkup(<BoardView {...base} />);
    expect(html).toContain('board-tile--called');
  });

  it('自家の捨て牌データがあれば裏向きではなくその牌を表示する', () => {
    const html = renderToStaticMarkup(
      <BoardView
        {...base}
        otherDiscards={[
          ...base.otherDiscards,
          { player: '南', tiles: ['1z', '2z', '3z'], riichiIndex: null, melds: [] },
        ]}
      />
    );
    // 自分（南）はデータどおり3枚で裏向きなし。裏向きが残るのはデータが無い東と北だけ
    expect(riverBacks(html)).toBe(7 + 7);
  });

  it('他家の手牌が裏向きで出る（副露1組につき3枚減る）', () => {
    const html = renderToStaticMarkup(<BoardView {...base} />);
    // 西はチー1組なので10枚、東と北は13枚ずつ
    expect((html.match(/board-seat-hand-tile/g) ?? []).length).toBe(13 + 13 + 10);
  });

  it('ドラ表示牌が王牌7枚の中に出る', () => {
    const html = renderToStaticMarkup(<BoardView {...base} />);
    expect(html).toContain('board-dead-wall');
    // 1m のドラ表示牌は 9m。王牌のうち表向きはこの1枚だけ
    expect(html).toContain('Man9.svg');
  });

  // 通常は「13 − 3×副露数」で描くが、牌譜を再現しているときは実際の枚数を渡す
  // （他家がツモった直後は14枚になる）
  it('他家の手牌の枚数を明示できる', () => {
    const count = html => (html.match(/board-seat-hand-tile/g) ?? []).length;
    // base は自風=南・西家だけチー1組 → 東13 + 西10 + 北13
    expect(count(renderToStaticMarkup(<BoardView {...base} />))).toBe(36);
    // 東家がツモった直後（14枚）を明示する
    expect(count(renderToStaticMarkup(
      <BoardView {...base} concealedCounts={{ 東: 14, 西: 10, 北: 13 }} />
    ))).toBe(37);
  });

  it('データが空でも落ちない', () => {
    const html = renderToStaticMarkup(<BoardView onSelectArea={() => {}} />);
    expect(html).toContain('board-center');
    expect(html).toContain('手牌が未設定です');
  });

  // 牌譜から切り出した局面は ProblemEditor 経由でこの盤面に流し込まれる（my問題集）。
  // 再生した結果をそのまま描画できることをここで固定する。
  // なお onSelectArea は BoardView が直接呼ぶため、表示だけの用途でも必須
  it('牌譜から再現した盤面を描画できる', () => {
    const problem = snapshotToProblem(
      replayRound(paifu, 0, { seat: 1, turn: 10 }).snapshot
    );
    const html = renderToStaticMarkup(
      <BoardView
        onSelectArea={() => {}}
        tiles={problem.tiles}
        melds={problem.melds}
        dora={problem.dora}
        bakaze={problem.bakaze}
        kyoku={problem.kyoku}
        honba={problem.honba}
        jikaze={problem.jikaze}
        junme={problem.junme}
        scores={problem.scores}
        otherDiscards={problem.otherDiscards ?? []}
      />
    );
    expect(html).toContain('board-center');
    // 自分の手牌（11枚）と副露（8m のポン）が出ている
    expect(html).toContain('board-hand-tiles');
    expect(html).toContain('Man8.svg');
    expect(html).not.toContain('手牌が未設定です');
    // 河は全員ぶんデータがあるので裏向きでの補完は起きない
    expect(riverBacks(html)).toBe(0);
  });

  it('自風・巡目・点数・ドラが未設定でも落ちない', () => {
    const html = renderToStaticMarkup(
      <BoardView {...base} jikaze={null} junme={null} scores={null} dora={null} />
    );
    expect(html).toContain('board-center');
    expect(riverBacks(html)).toBe(0); // 巡目が無ければ裏向きは並べない
  });

  // 出題画面は同じ盤面を表示専用で使う。押せる要素が残っていると
  // タップやキーボードのフォーカスが盤面じゅうに反応してしまうので、そこを固定する
  describe('readOnly（表示専用モード）', () => {
    it('押せる要素が1つも残らない', () => {
      const html = renderToStaticMarkup(<BoardView {...base} readOnly />);
      expect(html).not.toContain('<button');
      expect(html).not.toContain('<select');
      expect(html).toContain('board--readonly');
    });

    it('局・本場・巡目がセレクタではなく文字で出る', () => {
      const html = renderToStaticMarkup(<BoardView {...base} honba={2} readOnly />);
      expect(html).toContain('東1局 2本場');
      expect(html).toContain('7巡目');
    });

    it('未設定の局・巡目は行ごと出さない（「—」を並べない）', () => {
      const html = renderToStaticMarkup(
        <BoardView {...base} bakaze={null} kyoku={null} junme={null} readOnly />
      );
      expect(html).not.toContain('board-kyoku');
      expect(html).not.toContain('board-junme');
      expect(html).toContain('board-center');
    });

    it('空の領域に破線のプレースホルダーを出さない', () => {
      const html = renderToStaticMarkup(
        <BoardView {...base} tiles={[]} otherDiscards={[]} junme={null} readOnly />
      );
      expect(html).not.toContain('board-area--empty');
      expect(html).not.toContain('手牌が未設定です');
    });

    // 出題画面では回答用の手牌を卓の直下に置くため、盤面側の手牌は消す
    it('hideSelfHand で自分の手牌と副露を出さない', () => {
      const html = renderToStaticMarkup(<BoardView {...base} readOnly hideSelfHand />);
      expect(html).not.toContain('board-hand-tiles');
      expect(html).not.toContain('board-outer--bottom');
      // 自分の河と他家の手牌は残る
      expect(html).toContain('board-seat--self');
      expect(html).toContain('board-seat-hand-tile');
    });

    it('onSelectArea を渡さなくても描画できる', () => {
      const html = renderToStaticMarkup(<BoardView {...base} readOnly onSelectArea={undefined} />);
      expect(html).toContain('board-center');
    });
  });

  it('手牌タブを開いている間だけ、手牌のクリックが削除になる', () => {
    const editing = renderToStaticMarkup(
      <BoardView {...base} activeArea="hand" onRemoveHandTile={() => {}} />
    );
    expect(editing).toContain('title="クリックで削除"');
    // 他のタブを開いているときは削除にならない
    const browsing = renderToStaticMarkup(
      <BoardView {...base} activeArea="jokyo" onRemoveHandTile={() => {}} />
    );
    expect(browsing).not.toContain('title="クリックで削除"');
  });
});
