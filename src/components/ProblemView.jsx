import { Fragment, useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import TileButton from './TileButton';
import { getTileLabel, getTileImageUrl, compareTiles, randomSuitMap, remapProblem, getDoraIndicator } from '../utils/tileUtils';
import { getSituationText } from '../utils/categoryUtils';
import { normalizeProblemType, isRiichiJudgmentProblem, judgeAnswer, judgeNakiTiming, judgeNakiChoice, judgeBetaori, parseAnswers } from '../utils/judgeUtils';
import { usesBoardView, usesSuitRemap } from '../utils/problemDisplay';
import { buildProblemShareUrl } from '../utils/problemShare';
import ResponsiveBoard from './ResponsiveBoard';
import ShareButton from './ShareButton';
import { useDragReorder } from '../utils/useDragReorder';
import { NAKI_TIMING_OPTIONS, MELD_TYPE_LABELS, getMeldTileRole } from '../utils/problemConstants';

// 問題画像は Supabase Storage の署名付きURLを使うため、読み込むと supabase-js（約216kBの
// チャンク）まで芋づるで付いてくる。画像を持つのは公式問題の一部だけで、
// **認証不要の共有ページ（share.html）には一切必要ない**ため遅延読み込みにする。
// 画像付きの問題を開いたときだけチャンクを取りに行く
const QuestionImage = lazy(() => import('./QuestionImage'));

function ExplanationText({ text, className = 'answer-explanation' }) {
  if (!text) return null;
  const parts = [];
  const regex = /\[([0-9][mpsz])\]/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'tile', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.type === 'text'
          ? part.value
          : <img key={i} src={getTileImageUrl(part.value)} alt={getTileLabel(part.value)} className="explanation-tile-img" />
      )}
    </p>
  );
}

// showType=false でチー/ポン等の種類バッジを省略できる（他家捨て牌の横に出すときは牌だけ表示する）
function MeldDisplay({ meld, showType = true }) {
  // from（鳴いた元）で横向きの牌の位置が変わる（上家=左端 / 対面=真ん中 / 下家=右端）。
  // 管理画面の MeldPreview と同じ getMeldTileRole を使うことで見た目を揃えている
  const { type, tiles, from } = meld;
  return (
    <div className="meld-set">
      {showType && <div className="meld-type-badge">{MELD_TYPE_LABELS[type]}</div>}
      <div className="meld-tiles">
        {tiles.map((tile, i) => {
          const role = getMeldTileRole(type, i, from);
          if (role === 'back') {
            return <div key={i} className="meld-tile meld-tile--back" />;
          }
          return (
            <div key={i} className={`meld-tile${role === 'rotated' ? ' meld-tile--rotated tile-rotated' : ''}`}>
              <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 解答パネルの共通枠。「正解！/不正解」の見出しと解説を描画し、
// 正解の中身（牌・テキスト等）は children で受け取る。
// showLabel: false にすると「正解：」ラベルを出さない（betaori のように children 側でラベルを持つ場合）
function AnswerPanel({ isCorrect, explanation, children, showLabel = true }) {
  return (
    <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
      <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
      <div className="answer-tile">
        {showLabel && <span className="answer-label">正解：</span>}
        {children}
      </div>
      <ExplanationText text={explanation} />
    </div>
  );
}

function DoraIndicatorDisplay({ tile }) {
  return (
    <div className="dora-indicator">
      <div className="dora-indicator-back" />
      <div className="dora-indicator-back" />
      <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} className="dora-indicator-tile" />
      <div className="dora-indicator-back" />
      <div className="dora-indicator-back" />
      <div className="dora-indicator-back" />
      <div className="dora-indicator-back" />
    </div>
  );
}

// 点数状況バー。scores が未設定（null）の問題では表示しない。
// jikaze と一致する家に「自分」バッジを付け、供託は 1000点以上あるときだけ末尾に出す
function ScoreDisplay({ scores, jikaze }) {
  if (!scores) return null;
  return (
    <div className="score-display">
      {['東', '南', '西', '北'].map(w => {
        const isSelf = jikaze === w;
        return (
          <div key={w} className={`score-chip${isSelf ? ' score-chip--self' : ''}`}>
            <span className="score-chip-wind">
              {w}家
              {isSelf && <span className="score-chip-self-badge">自分</span>}
            </span>
            <span className="score-chip-points">{(scores[w] ?? 0).toLocaleString()}</span>
          </div>
        );
      })}
      {(scores.kyotaku ?? 0) > 0 && (
        <div className="score-chip score-chip--kyotaku">
          <span className="score-chip-wind">供託</span>
          <span className="score-chip-points">{scores.kyotaku.toLocaleString()}点</span>
        </div>
      )}
    </div>
  );
}

// スマホ表示で1家分（捨て牌＋副露）を1行に収めるための「牌何枚分の幅か」の換算値。
// App.css のモバイル media query が --od-units としてこの値で牌幅を割り出す。
// リーチ宣言牌・副露の横向き牌は縦横比（30/22）ぶん広く、副露の隙間は1組につき
// +0.5 枚で見込む（収まらない極端なケースは行ごとの横スクロールに逃がす）
function discardRowUnits(od) {
  const rotatedExtra = 30 / 22 - 1;
  const cols = Math.min(6, od.tiles.length) + (od.riichiIndex != null ? rotatedExtra : 0);
  const melds = Array.isArray(od.melds) ? od.melds : [];
  const meldUnits = melds.reduce(
    (sum, m) => sum + m.tiles.length + (m.type === 'ankan' ? 0 : rotatedExtra),
    0
  );
  return cols + meldUnits + melds.length * 0.5;
}

// jikaze と一致する家は自分の捨て牌（2026-07-27〜。管理画面で自家の河も設定できる）
function OtherDiscardDisplay({ otherDiscards, jikaze = null }) {
  const valid = (otherDiscards ?? []).filter(od => od && od.player && od.tiles && od.tiles.length > 0);
  if (valid.length === 0) return null;
  // 副露している家が1人でもいれば全員を縦積みにする（捨て牌＋副露で1行が長くなるため）。
  // 誰も副露していなければ従来どおり横並び（幅が足りなければ折り返す）
  const hasMelds = valid.some(od => Array.isArray(od.melds) && od.melds.length > 0);
  return (
    <div className={`other-discard-displays${hasMelds ? ' other-discard-displays--column' : ''}`}>
      {valid.map((od, idx) => {
        // 6枚ごとに行分割する。各行は独立した flex で詰めて並べるため、
        // リーチ宣言牌（横向き・幅広）があっても他の行に余白は生じない（縦の列は揃わない）
        const rows = [];
        for (let r = 0; r < od.tiles.length; r += 6) rows.push(od.tiles.slice(r, r + 6));
        return (
          <div key={idx} className="other-discard-display" style={{ '--od-units': discardRowUnits(od) }}>
            <span className="other-discard-label">
              {od.player === jikaze ? '自分の捨て牌' : `${od.player}家捨て牌`}
            </span>
            <div className="other-discard-tiles">
              {rows.map((row, ri) => (
                <div key={ri} className="other-discard-tiles-row">
                  {row.map((tile, ci) => {
                    const i = ri * 6 + ci; // リーチ宣言牌は分割前の通し index で判定
                    // ツモ切りはわずかに沈ませる（盤面の .board-tile--tsumogiri と同じ考え方）。
                    // 手出しとの差が押し引きの読みの根拠になるので消さないこと
                    const isTsumogiri = Array.isArray(od.tsumogiri) && od.tsumogiri[i] === true;
                    return (
                      <div
                        key={i}
                        className={`other-discard-tile${od.riichiIndex === i ? ' other-discard-tile--rotated tile-rotated' : ''}${isTsumogiri ? ' other-discard-tile--tsumogiri' : ''}`}
                      >
                        <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {Array.isArray(od.melds) && od.melds.length > 0 && (
              <div className="other-discard-melds">
                {od.melds.map((meld, mi) => (
                  <MeldDisplay key={mi} meld={meld} showType={false} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// スマホ表示で手牌と副露を1行に収めるための「牌何枚分の幅か」の換算値。
// App.css のモバイル media query が --hand-count としてこの値で牌幅を割り出す。
// 副露牌は手牌の0.9倍幅だがそのまま1枚と数え、横向き牌の広がりと区切り線・
// 隙間ぶんは副露1組につき +0.5 枚で見込む（やや小さめに出る安全側の概算。
// それでも収まらない極端な副露数は .hand-and-melds の overflow-x: auto に逃がす）
function handRowUnits(tiles, melds) {
  const hand = tiles?.length ?? 0;
  if (!Array.isArray(melds) || melds.length === 0) return hand;
  const meldTiles = melds.reduce((sum, m) => sum + m.tiles.length, 0);
  return hand + meldTiles + melds.length * 0.5;
}

// 手牌が未設定でも他家捨て牌は独立して表示する（問題タイプ間で挙動を揃える）。
// 手牌と他家の捨て牌は .hand-block でまとめ、左端を縦に揃える（下の通常の何切ると同じ扱い）
function HandDisplay({ tiles, melds, otherDiscards, jikaze }) {
  const hasMelds = Array.isArray(melds) && melds.length > 0;
  const hasHand = tiles && tiles.length > 0;
  const hasDiscards = (otherDiscards ?? []).some(od => od?.player && od.tiles?.length > 0);
  // どちらも無いときに空の div を残すと .problem-view の gap だけが空きとして残る
  if (!hasHand && !hasDiscards) return null;
  return (
    <div className="hand-block">
      {hasHand && (
        <div className="hand-and-melds" style={{ '--hand-count': handRowUnits(tiles, melds) }}>
          <div className="tile-display-readonly">
            {tiles.map((tile, i) => (
              <div key={`${tile}-${i}`} className="tile-readonly">
                <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
              </div>
            ))}
          </div>
          {hasMelds && (
            <div className="melds-area">
              {melds.map((meld, i) => (
                <MeldDisplay key={i} meld={meld} />
              ))}
            </div>
          )}
        </div>
      )}
      <OtherDiscardDisplay otherDiscards={otherDiscards} jikaze={jikaze} />
    </div>
  );
}

// ===== パターン1: 鳴きタイミング =====
function NakiTimingView({ problem, onAnswer, savedAnswer, onPersist }) {
  const [selected, setSelected] = useState(savedAnswer?.nakiTiming ?? null);
  const answered = selected !== null;
  const isCorrect = judgeNakiTiming(problem, selected);

  function handleSelect(value) {
    if (answered) return;
    setSelected(value);
    onAnswer?.(judgeNakiTiming(problem, value));
    onPersist?.({ nakiTiming: value });
  }

  return (
    <>
      {problem.discardedTile && (
        <div className="discarded-tile-display">
          <span className="discarded-tile-label">出た牌</span>
          <img
            src={getTileImageUrl(problem.discardedTile)}
            alt={getTileLabel(problem.discardedTile)}
            className="discarded-tile-img"
          />
          <span className="discarded-tile-name">{getTileLabel(problem.discardedTile)}</span>
        </div>
      )}

      <HandDisplay tiles={problem.tiles} melds={problem.melds} otherDiscards={problem.otherDiscards} jikaze={problem.jikaze} />

      {!answered ? (
        <div className="naki-timing-btns">
          {NAKI_TIMING_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className="naki-timing-choice-btn"
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <AnswerPanel isCorrect={isCorrect} explanation={problem.explanation}>
          <span className="answer-tile-name">
            {NAKI_TIMING_OPTIONS.find(o => o.value === problem.answer)?.label ?? '未設定'}
          </span>
        </AnswerPanel>
      )}
    </>
  );
}

function sortChoices(choices) {
  return [...choices].sort((a, b) => compareTiles(a.tile, b.tile));
}

// ===== パターン2: 鳴き選択 =====
function NakiChoiceView({ problem, onAnswer, savedAnswer, onPersist }) {
  const sortedChoices = sortChoices(problem.nakiChoices ?? []);
  const [selected, setSelected] = useState(() => new Set(savedAnswer?.nakiChoiceTiles ?? []));
  const [answered, setAnswered] = useState(savedAnswer?.nakiChoiceTiles != null);

  function toggleSelect(tile) {
    if (answered) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(tile) ? next.delete(tile) : next.add(tile);
      return next;
    });
  }

  function getTileState(c) {
    const isSelected = selected.has(c.tile);
    if (!answered) return isSelected ? 'selected' : null;
    if (c.correct && isSelected) return 'correct';
    if (c.correct && !isSelected) return 'missed';
    if (!c.correct && isSelected) return 'wrong';
    return 'disabled';
  }

  const correctTiles = new Set(sortedChoices.filter(c => c.correct).map(c => c.tile));
  const isCorrect = answered && judgeNakiChoice(sortedChoices, selected);

  return (
    <>
      <HandDisplay tiles={problem.tiles} melds={problem.melds} otherDiscards={problem.otherDiscards} jikaze={problem.jikaze} />

      <p className="naki-choice-instruction">鳴く牌をすべて選んでください（複数選択可）</p>

      <div className="tile-selector" style={{ '--hand-count': sortedChoices.length }}>
        {sortedChoices.map((c, i) => (
          <TileButton
            key={i}
            tile={c.tile}
            onClick={() => toggleSelect(c.tile)}
            state={getTileState(c)}
          />
        ))}
      </div>

      {!answered ? (
        <button className="naki-choice-submit-btn" onClick={() => {
          setAnswered(true);
          onAnswer?.(judgeNakiChoice(sortedChoices, selected));
          onPersist?.({ nakiChoiceTiles: [...selected] });
        }}>
          答え合わせ
        </button>
      ) : (
        <AnswerPanel isCorrect={isCorrect} explanation={problem.explanation}>
          {sortedChoices.filter(c => c.correct).map(c => (
            <div key={c.tile} className="tile-readonly">
              <img src={getTileImageUrl(c.tile)} alt={getTileLabel(c.tile)} />
            </div>
          ))}
          {correctTiles.size === 0 && <span className="answer-tile-name">なし（鳴かない）</span>}
        </AnswerPanel>
      )}
    </>
  );
}

// ===== パターン3: ベタオリ（安全な順に並べる） =====
// answer はカンマ区切りの「順序付きリスト」（安全な順・default タイプの複数正解 OR とは意味が異なる）。
// 牌をタップした順に ①②③… を付け、再タップで解除。正解と同じ枚数選んだら答え合わせできる
function BetaoriView({ problem, onAnswer, savedAnswer, onPersist }) {
  const answers = parseAnswers(problem.answer);
  const [selectedOrder, setSelectedOrder] = useState(() => savedAnswer?.betaoriTiles ?? []);
  const [answered, setAnswered] = useState(savedAnswer?.betaoriTiles != null);
  const hasMelds = Array.isArray(problem.melds) && problem.melds.length > 0;

  function toggleSelect(tile) {
    if (answered) return;
    setSelectedOrder(prev => {
      if (prev.includes(tile)) return prev.filter(t => t !== tile);
      if (prev.length >= answers.length) return prev;
      return [...prev, tile];
    });
  }

  function moveSelected(from, to) {
    setSelectedOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // 「あなたの並び」行のドラッグ並べ替え（マウス・タッチ両対応・捨て牌設定と同じ操作感）
  const { containerRef: orderRef, dragIndex: orderDragIndex, dropIndex: orderDropIndex, handlers: orderDragHandlers } =
    useDragReorder(moveSelected, { disabled: answered });

  // 同一牌が手牌に複数あるときは1つの牌コードとして扱い、バッジ・状態は最初の1枚にだけ付ける
  function isFirstOccurrence(tile, i) {
    return problem.tiles.indexOf(tile) === i;
  }

  function getTileState(tile, i) {
    if (!isFirstOccurrence(tile, i)) return answered ? 'disabled' : null;
    const pos = selectedOrder.indexOf(tile);
    if (!answered) return pos >= 0 ? 'selected' : null;
    if (pos >= 0) return answers[pos] === tile ? 'correct' : 'wrong';
    return answers.includes(tile) ? 'missed' : 'disabled';
  }

  const isCorrect = answered && judgeBetaori(problem, selectedOrder);
  const canSubmit = answers.length > 0 && selectedOrder.length === answers.length;

  if (answers.length === 0 || !problem.tiles || problem.tiles.length === 0) {
    return (
      <div className="pending-notice">
        この問題の回答・解説は準備中です
      </div>
    );
  }

  return (
    <>
      <p className="naki-choice-instruction">
        安全に切れる順に{answers.length}枚選んでください（①が最も安全・もう一度タップで解除）
      </p>

      <div className="tile-selector-row">
        <div className="hand-and-melds" style={{ '--hand-count': handRowUnits(problem.tiles, problem.melds) }}>
          <div className="tile-selector">
            {problem.tiles.map((tile, i) => {
              const pos = isFirstOccurrence(tile, i) ? selectedOrder.indexOf(tile) : -1;
              return (
                <TileButton
                  key={`${tile}-${i}`}
                  tile={tile}
                  onClick={() => toggleSelect(tile)}
                  state={getTileState(tile, i)}
                  badge={pos >= 0 ? pos + 1 : null}
                />
              );
            })}
          </div>
          {hasMelds && (
            <div className="melds-area">
              {problem.melds.map((meld, i) => (
                <MeldDisplay key={i} meld={meld} />
              ))}
            </div>
          )}
        </div>
      </div>
      <OtherDiscardDisplay otherDiscards={problem.otherDiscards} jikaze={problem.jikaze} />

      {selectedOrder.length > 0 && !answered && (
        <div className="betaori-order-row">
          <span className="betaori-order-label">あなたの並び（ドラッグで入れ替え）</span>
          {/* --order-count: スマホで1行に収めるための牌幅計算用（選択中に牌サイズが変わらないよう最終枚数で固定） */}
          <div className="betaori-order-tiles" ref={orderRef} style={{ '--order-count': answers.length }}>
            {selectedOrder.map((t, i) => (
              <div
                key={t}
                data-drag-index={i}
                className={
                  'betaori-order-tile' +
                  (orderDragIndex === i ? ' betaori-order-tile--dragging' : '') +
                  (orderDropIndex === i ? ' betaori-order-tile--drop-before' : '') +
                  (orderDropIndex === i + 1 && i === selectedOrder.length - 1 ? ' betaori-order-tile--drop-after' : '')
                }
                {...orderDragHandlers}
              >
                <img src={getTileImageUrl(t)} alt={getTileLabel(t)} draggable={false} />
                <span className="tile-order-badge">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!answered ? (
        <button
          className="naki-choice-submit-btn"
          disabled={!canSubmit}
          onClick={() => {
            setAnswered(true);
            onAnswer?.(judgeBetaori(problem, selectedOrder));
            onPersist?.({ betaoriTiles: selectedOrder });
          }}
        >
          {canSubmit ? '答え合わせ' : `答え合わせ（あと${answers.length - selectedOrder.length}枚）`}
        </button>
      ) : (
        <AnswerPanel isCorrect={isCorrect} explanation={problem.explanation} showLabel={false}>
          {/* 正解とあなたの回答を、同じ順位の牌が縦に揃うように表示する（ラベル幅を固定して列を合わせる） */}
          <div className="betaori-answer-compare">
            <div className="betaori-answer-line">
              <span className="betaori-answer-line-label">正解：</span>
              {answers.map((a, i) => (
                <Fragment key={`${a}-${i}`}>
                  {i > 0 && <span className="answer-tile-name">→</span>}
                  <div className="tile-readonly betaori-answer-tile">
                    <img src={getTileImageUrl(a)} alt={getTileLabel(a)} />
                    <span className="tile-order-badge">{i + 1}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            {!isCorrect && (
              <div className="betaori-answer-line">
                <span className="betaori-answer-line-label">あなたの回答：</span>
                {selectedOrder.map((t, i) => (
                  <Fragment key={`${t}-${i}`}>
                    {i > 0 && <span className="answer-tile-name">→</span>}
                    <div
                      className={`tile-readonly betaori-answer-tile ${answers[i] === t ? 'tile-readonly--ok' : 'tile-readonly--ng'}`}
                    >
                      <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
                      <span className="tile-order-badge">{i + 1}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </AnswerPanel>
      )}
    </>
  );
}

// ===== メイン =====
// standalone … 共有ページ（share.html）のように「1問だけを単独で見せる」用途。
//   ラウンドの文脈（カテゴリへ戻る・問題 n/m・前後のナビ）が存在しないので、それらを出さない。
//   既定は false ＝ 出題フローの従来動作なので、App.jsx 側は無変更で動く
export default function ProblemView({ problem, index, total, onBack, onPrev, onNext, onFinish, onAnswer, savedAnswer, onPersistAnswer, standalone = false }) {
  // savedAnswer があれば回答済み状態（選択牌・リーチ・スーツ置換）を復元する。
  // 問題の切替は key（playingKey-currentIndex）による再マウントで行われるため、
  // ここでの useState 初期化だけで問題ごとの初期化が完結する
  const [selected, setSelected] = useState(savedAnswer?.selected ?? null);
  const [selectedRiichi, setSelectedRiichi] = useState(savedAnswer?.selectedRiichi ?? null);
  const [suitMap] = useState(() => savedAnswer?.suitMap ?? randomSuitMap());
  // 復元時は onAnswer / persist を再発火させない
  const restoredRef = useRef(savedAnswer != null);

  function persistAnswer(data) {
    onPersistAnswer?.(problem.id, { suitMap, ...data });
  }

  // スーツ置換するかは usesSuitRemap が唯一の判定（自作問題・画像付きは置換しない）。
  // ここに条件を書き足さないこと
  const p = useMemo(
    () => (usesSuitRemap(problem) ? remapProblem(problem, suitMap) : problem),
    [problem, suitMap],
  );

  // 麻雀卓の形で出すか（自作問題と、管理画面で「盤面で出題」にした公式問題）。
  // 卓には局・巡目・ドラ・点数・各家の河が全部入っているので、
  // 従来のヘッダー表示と他家の捨て牌は出さず、卓に一本化する
  const showBoard = usesBoardView(problem);
  // 子のビューに渡す問題。盤面が他家の捨て牌を描くので、そちらからは外して二重表示を防ぐ
  const pv = showBoard ? { ...p, otherDiscards: null } : p;

  const problemType   = normalizeProblemType(p.problemType);
  const isRiichiJudgment = isRiichiJudgmentProblem(p);
  const needsRiichi = !isRiichiJudgment && p.riichi !== null && p.riichi !== undefined;
  const answered = selected !== null;
  const hasMelds = Array.isArray(p.melds) && p.melds.length > 0;
  // .hand-block を出すかの判定（中身が空のブロックを残さないため）
  const hasHandTiles = (p.tiles?.length ?? 0) > 0;
  const hasOtherDiscards = (pv.otherDiscards ?? []).some(od => od?.player && od.tiles?.length > 0);

  // 正解はカンマ区切りで複数持てる。牌切りと暗槓（ankan:）が混在してもよい
  const answers = parseAnswers(p.answer);
  const answerTiles = answers.filter(a => !a.startsWith('ankan:'));
  const answerKanTiles = answers.filter(a => a.startsWith('ankan:')).map(a => a.slice(6));

  const quadTiles = useMemo(() => {
    const counts = {};
    for (const tile of p.tiles ?? []) counts[tile] = (counts[tile] ?? 0) + 1;
    return Object.keys(counts).filter(tile => counts[tile] === 4);
  }, [p.tiles]);

  const isCorrect = judgeAnswer(p, { selected, selectedRiichi });

  // シェアできるのは自作問題だけ（公式問題は書籍の内容なので共有導線を作らない）。
  // 共有ページ（standalone）では既に共有された問題を見ているので出さない。
  // 自作問題はスーツ置換しない（usesSuitRemap）ので p === problem ＝ 作者が作った牌姿が
  // そのまま共有される。実戦の局面を切り取って議論するのが目的なのでずらしてはいけない
  const canShare = !!problem.isUserProblem && !standalone;
  const [shareUrl, setShareUrl] = useState(null);
  useEffect(() => {
    if (!canShare) return undefined;
    let cancelled = false;
    // 圧縮が非同期なので、URL ができるまで ShareButton は何も描かない
    buildProblemShareUrl(p).then(url => { if (!cancelled) setShareUrl(url); });
    return () => { cancelled = true; };
  }, [canShare, p]);

  useEffect(() => {
    if (!answered || restoredRef.current) return;
    // これらのタイプは各 View 内で onAnswer / persist を行う
    if (problemType === 'naki-timing' || problemType === 'naki-choice' || problemType === 'betaori') return;
    onAnswer?.(problem.id, isCorrect);
    persistAnswer({ selected, selectedRiichi });
  }, [answered]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(tile) {
    if (!answered) setSelected(tile);
  }

  function handleKan(kanTile) {
    if (!answered) setSelected(`ankan:${kanTile}`);
  }

  function handleRiichiChoice(choice) {
    if (answered) return;
    setSelectedRiichi(choice);
    setSelected('__riichi_choice__');
  }

  function toggleRiichi() {
    if (!answered) setSelectedRiichi(prev => !prev);
  }

  function getTileState(tile) {
    if (!answered) return null;
    if (answerTiles.includes(tile)) return 'correct';
    if (tile === selected) return 'wrong';
    return 'disabled';
  }

  function getKanBtnState(kanTile) {
    if (!answered) return null;
    if (answerKanTiles.includes(kanTile)) return 'correct';
    if (selected === `ankan:${kanTile}`) return 'wrong';
    return 'disabled';
  }

  return (
    <div className="problem-view">
      {!standalone && (
        <>
          <div className="problem-header">
            <button className="btn-back" onClick={onBack}>← カテゴリへ</button>
            <div className="problem-header-right">
              <span className="problem-counter">問題 {index + 1} / {total}</span>
              {/* 自作問題の id は uuid で読めないため、表示用の連番があればそちらを出す */}
              <span className="problem-id-label">#{problem.displayNo ?? problem.id}</span>
            </div>
          </div>

          <div className="problem-progress" aria-hidden="true">
            <div
              className="problem-progress-fill"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </>
      )}

      {/* 麻雀卓。局・巡目・ドラ・点数・各家の河をまとめて描くので、
          下の problem-info-row / ScoreDisplay / 他家の捨て牌は出さない。
          自分の手牌も卓には出さず（hideSelfHand）、回答用の手牌を卓の直下に置く */}
      {showBoard && (
        <ResponsiveBoard
          hideSelfHand
          tiles={p.tiles ?? []}
          melds={p.melds ?? []}
          dora={p.dora}
          bakaze={p.bakaze}
          kyoku={p.kyoku}
          honba={p.honba}
          jikaze={p.jikaze}
          junme={p.junme}
          scores={p.scores}
          otherDiscards={p.otherDiscards ?? []}
        />
      )}

      {!showBoard && (() => {
        const hasSituationFields = p.bakaze || p.jikaze || p.junme != null;
        const situationText = hasSituationFields
          ? [
              // 局が設定されていれば「南1局」、なければ従来どおり「南場」。本場は1以上のときだけ添える
              p.bakaze
                ? (p.kyoku != null
                    ? `${p.bakaze}${p.kyoku}局${p.honba ? ` ${p.honba}本場` : ''}`
                    : `${p.bakaze}場`)
                : null,
              p.jikaze ? `${p.jikaze}家` : null,
              p.junme  != null ? `${p.junme}巡目` : null,
            ].filter(Boolean).join(' ')
          : getSituationText(p.section);
        const doraIndicator = getDoraIndicator(p.dora);
        if (!situationText && !doraIndicator) return null;
        return (
          <div className="problem-info-row">
            {situationText && <span className="problem-situation">{situationText}</span>}
            {doraIndicator && <DoraIndicatorDisplay tile={doraIndicator} />}
          </div>
        );
      })()}

      {!showBoard && <ScoreDisplay scores={p.scores} jikaze={p.jikaze} />}

      <ExplanationText text={p.note} className="problem-note" />

      {/* ===== 鳴きタイミング ===== */}
      {problemType === 'naki-timing' && (
        <NakiTimingView
          problem={pv}
          onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)}
          savedAnswer={savedAnswer}
          onPersist={persistAnswer}
        />
      )}

      {/* ===== 鳴き選択 ===== */}
      {problemType === 'naki-choice' && (
        <NakiChoiceView
          problem={pv}
          onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)}
          savedAnswer={savedAnswer}
          onPersist={persistAnswer}
        />
      )}

      {/* ===== ベタオリ（安全な順に並べる） ===== */}
      {problemType === 'betaori' && (
        <BetaoriView
          problem={pv}
          onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)}
          savedAnswer={savedAnswer}
          onPersist={persistAnswer}
        />
      )}

      {/* ===== 問題画像（全タイプ共通・署名付きURLで表示） =====
          画像がある問題だけ QuestionImage を読み込む（無条件に置くと supabase まで付いてくる） */}
      {p.questionImageUrl && (
        <Suspense fallback={null}>
          <QuestionImage value={p.questionImageUrl} wrapClassName="question-image-wrap" imgClassName="question-image" />
        </Suspense>
      )}

      {/* ===== リーチ判断 ===== */}
      {isRiichiJudgment && (
        <>
          <HandDisplay tiles={pv.tiles} melds={pv.melds} otherDiscards={pv.otherDiscards} jikaze={pv.jikaze} />

          {!answered ? (
            <div className="riichi-choice-btns">
              <button className="riichi-choice-btn riichi-choice-btn--riichi" onClick={() => handleRiichiChoice(true)}>
                リーチ
              </button>
              <button className="riichi-choice-btn riichi-choice-btn--dama" onClick={() => handleRiichiChoice(false)}>
                ダマ
              </button>
            </div>
          ) : (
            <AnswerPanel isCorrect={isCorrect} explanation={p.explanation}>
              <span className="answer-tile-name">
                {p.riichi === true ? 'リーチ' : p.riichi === false ? 'ダマ' : '未設定'}
              </span>
            </AnswerPanel>
          )}
        </>
      )}

      {/* ===== 通常の何切るカテゴリ ===== */}
      {problemType === 'default' && !isRiichiJudgment && (
        <>
          {/* 手牌・リーチ・他家の捨て牌・暗槓は左端を縦に揃える（.hand-block でまとめて中央寄せ）。
              中身が1つも無いときに空の div を残すと .problem-view の gap だけが空きとして残る */}
          {(hasHandTiles || hasOtherDiscards || quadTiles.length > 0) && (
          <div className="hand-block">
          {p.tiles && p.tiles.length > 0 && (
            <div className="tile-selector-row">
              <div className="hand-and-melds" style={{ '--hand-count': handRowUnits(p.tiles, p.melds) }}>
                <div className="tile-selector">
                  {p.tiles.map((tile, i) => (
                    <TileButton
                      key={`${tile}-${i}`}
                      tile={tile}
                      onClick={() => handleSelect(tile)}
                      state={getTileState(tile)}
                    />
                  ))}
                </div>
                {hasMelds && (
                  <div className="melds-area">
                    {p.melds.map((meld, i) => (
                      <MeldDisplay key={i} meld={meld} />
                    ))}
                  </div>
                )}
              </div>
              {needsRiichi && (
                <button
                  className={`riichi-toggle${selectedRiichi ? ' riichi-toggle--on' : ''}`}
                  onClick={toggleRiichi}
                  disabled={answered}
                >
                  リーチ
                </button>
              )}
            </div>
          )}
          <OtherDiscardDisplay otherDiscards={pv.otherDiscards} jikaze={pv.jikaze} />
          {quadTiles.length > 0 && (
              <div className="ankan-options">
                {quadTiles.map(kanTile => {
                  const st = getKanBtnState(kanTile);
                  return (
                    <button
                      key={kanTile}
                      className={`ankan-btn${st ? ` ankan-btn--${st}` : ''}`}
                      onClick={() => handleKan(kanTile)}
                      disabled={answered}
                    >
                      <span className="ankan-btn-label">カン</span>
                      <img src={getTileImageUrl(kanTile)} alt={getTileLabel(kanTile)} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )}{/* /hand-block */}

            {answered && (
              <AnswerPanel isCorrect={isCorrect} explanation={p.explanation}>
                {answers.length === 0 && <span className="answer-tile-name">未設定</span>}
                {answers.map((a, i) => {
                  const isKan = a.startsWith('ankan:');
                  const tile = isKan ? a.slice(6) : a;
                  return (
                    <Fragment key={`${a}-${i}`}>
                      {i > 0 && <span className="answer-tile-name">・</span>}
                      {isKan && <span className="answer-tile-name">暗槓（</span>}
                      <div className="tile-readonly">
                        <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
                      </div>
                      <span className="answer-tile-name">{getTileLabel(tile)}{isKan ? '）' : ''}</span>
                    </Fragment>
                  );
                })}
                {needsRiichi && (
                  <span className="answer-riichi">
                    {p.riichi ? '・リーチする' : '・リーチしない'}
                  </span>
                )}
              </AnswerPanel>
            )}
          {(!p.tiles || p.tiles.length === 0) && (
            <div className="pending-notice">
              この問題の回答・解説は準備中です
            </div>
          )}
        </>
      )}

      {canShare && (
        <div className="problem-share-row">
          <ShareButton href={shareUrl} />
        </div>
      )}

      {!standalone && (
        <div className="problem-nav">
          <button className="btn-nav" onClick={onPrev} disabled={index === 0}>
            ← 前の問題
          </button>
          {index === total - 1 ? (
            <button className="btn-nav btn-nav--finish" onClick={onFinish}>
              結果を見る →
            </button>
          ) : (
            <button className="btn-nav" onClick={onNext}>
              次の問題 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
