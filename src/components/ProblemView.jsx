import { useState, useEffect, useMemo, useRef } from 'react';
import TileButton from './TileButton';
import QuestionImage from './QuestionImage';
import { getTileLabel, getTileImageUrl, compareTiles, randomSuitMap, remapProblem, getDoraIndicator } from '../utils/tileUtils';
import { getSituationText } from '../utils/categoryUtils';
import { normalizeProblemType, isRiichiJudgmentProblem, judgeAnswer, judgeNakiTiming, judgeNakiChoice } from '../utils/judgeUtils';
import { NAKI_TIMING_OPTIONS, MELD_TYPE_LABELS, getMeldTileRole } from '../utils/problemConstants';

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

function MeldDisplay({ meld }) {
  const { type, tiles } = meld;
  return (
    <div className="meld-set">
      <div className="meld-type-badge">{MELD_TYPE_LABELS[type]}</div>
      <div className="meld-tiles">
        {tiles.map((tile, i) => {
          const role = getMeldTileRole(type, i);
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
// 正解の中身（牌・テキスト等）は children で受け取る
function AnswerPanel({ isCorrect, explanation, children }) {
  return (
    <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
      <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
      <div className="answer-tile">
        <span className="answer-label">正解：</span>
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

function OtherDiscardDisplay({ otherDiscards }) {
  const valid = (otherDiscards ?? []).filter(od => od && od.player && od.tiles && od.tiles.length > 0);
  if (valid.length === 0) return null;
  return (
    // 人数分を横に並べる（画面幅が足りなければ折り返す）
    <div className="other-discard-displays">
      {valid.map((od, idx) => {
        // 6枚ごとに行分割する。各行は独立した flex で詰めて並べるため、
        // リーチ宣言牌（横向き・幅広）があっても他の行に余白は生じない（縦の列は揃わない）
        const rows = [];
        for (let r = 0; r < od.tiles.length; r += 6) rows.push(od.tiles.slice(r, r + 6));
        return (
          <div key={idx} className="other-discard-display">
            <span className="other-discard-label">{od.player}家捨て牌</span>
            <div className="other-discard-tiles">
              {rows.map((row, ri) => (
                <div key={ri} className="other-discard-tiles-row">
                  {row.map((tile, ci) => {
                    const i = ri * 6 + ci; // リーチ宣言牌は分割前の通し index で判定
                    return (
                      <div key={i} className={`other-discard-tile${od.riichiIndex === i ? ' other-discard-tile--rotated tile-rotated' : ''}`}>
                        <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 手牌が未設定でも他家捨て牌は独立して表示する（問題タイプ間で挙動を揃える）
function HandDisplay({ tiles, melds, otherDiscards }) {
  const hasMelds = Array.isArray(melds) && melds.length > 0;
  const hasHand = tiles && tiles.length > 0;
  return (
    <>
      {hasHand && (
        <div className="hand-and-melds">
          <div className="tile-display-readonly" style={{ '--hand-count': tiles.length }}>
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
      <OtherDiscardDisplay otherDiscards={otherDiscards} />
    </>
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

      <HandDisplay tiles={problem.tiles} melds={problem.melds} otherDiscards={problem.otherDiscards} />

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
      <HandDisplay tiles={problem.tiles} melds={problem.melds} otherDiscards={problem.otherDiscards} />

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

// ===== メイン =====
export default function ProblemView({ problem, index, total, onBack, onPrev, onNext, onFinish, onAnswer, savedAnswer, onPersistAnswer }) {
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

  // 問題画像付きの問題はスーツ置換すると画像と牌が食い違うためそのまま使う
  // （image-quiz は旧タイプ。DB移行済みだが未移行データの保険として残す）
  const p = useMemo(() => {
    if (problem.questionImageUrl || (problem.problemType ?? 'default') === 'image-quiz') return problem;
    return remapProblem(problem, suitMap);
  }, [problem, suitMap]);

  const problemType   = normalizeProblemType(p.problemType);
  const isRiichiJudgment = isRiichiJudgmentProblem(p);
  const needsRiichi = !isRiichiJudgment && p.riichi !== null && p.riichi !== undefined;
  const answered = selected !== null;
  const hasMelds = Array.isArray(p.melds) && p.melds.length > 0;

  const answerIsKan = typeof p.answer === 'string' && p.answer.startsWith('ankan:');
  const answerKanTile = answerIsKan ? p.answer.slice(6) : null;

  const quadTiles = useMemo(() => {
    const counts = {};
    for (const tile of p.tiles ?? []) counts[tile] = (counts[tile] ?? 0) + 1;
    return Object.keys(counts).filter(tile => counts[tile] === 4);
  }, [p.tiles]);

  const isCorrect = judgeAnswer(p, { selected, selectedRiichi });

  useEffect(() => {
    if (!answered || restoredRef.current) return;
    if (problemType === 'naki-timing' || problemType === 'naki-choice') return;
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
    if (answerIsKan) {
      if (tile === selected) return 'wrong';
      return 'disabled';
    }
    if (tile === p.answer) return 'correct';
    if (tile === selected) return 'wrong';
    return 'disabled';
  }

  function getKanBtnState(kanTile) {
    if (!answered) return null;
    if (answerKanTile === kanTile) return 'correct';
    if (selected === `ankan:${kanTile}`) return 'wrong';
    return 'disabled';
  }

  return (
    <div className="problem-view">
      <div className="problem-header">
        <button className="btn-back" onClick={onBack}>← カテゴリへ</button>
        <div className="problem-header-right">
          <span className="problem-counter">問題 {index + 1} / {total}</span>
          <span className="problem-id-label">#{problem.id}</span>
        </div>
      </div>

      <div className="problem-progress" aria-hidden="true">
        <div
          className="problem-progress-fill"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {(() => {
        const hasSituationFields = p.bakaze || p.jikaze || p.junme != null;
        const situationText = hasSituationFields
          ? [
              // 局が設定されていれば「南1局」、なければ従来どおり「南場」
              p.bakaze ? (p.kyoku != null ? `${p.bakaze}${p.kyoku}局` : `${p.bakaze}場`) : null,
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

      <ScoreDisplay scores={p.scores} jikaze={p.jikaze} />

      <ExplanationText text={p.note} className="problem-note" />

      {/* ===== 鳴きタイミング ===== */}
      {problemType === 'naki-timing' && (
        <NakiTimingView
          problem={p}
          onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)}
          savedAnswer={savedAnswer}
          onPersist={persistAnswer}
        />
      )}

      {/* ===== 鳴き選択 ===== */}
      {problemType === 'naki-choice' && (
        <NakiChoiceView
          problem={p}
          onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)}
          savedAnswer={savedAnswer}
          onPersist={persistAnswer}
        />
      )}

      {/* ===== 問題画像（全タイプ共通・署名付きURLで表示） ===== */}
      <QuestionImage value={p.questionImageUrl} wrapClassName="question-image-wrap" imgClassName="question-image" />

      {/* ===== リーチ判断 ===== */}
      {isRiichiJudgment && (
        <>
          <HandDisplay tiles={p.tiles} melds={p.melds} otherDiscards={p.otherDiscards} />

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
          {p.tiles && p.tiles.length > 0 && (
            <div className="tile-selector-row">
              <div className="hand-and-melds">
                <div className="tile-selector" style={{ '--hand-count': p.tiles.length }}>
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
          <OtherDiscardDisplay otherDiscards={p.otherDiscards} />
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

            {answered && (
              <AnswerPanel isCorrect={isCorrect} explanation={p.explanation}>
                {answerIsKan ? (
                  <>
                    <span className="answer-tile-name">暗槓（</span>
                    <div className="tile-readonly">
                      <img src={getTileImageUrl(answerKanTile)} alt={getTileLabel(answerKanTile)} />
                    </div>
                    <span className="answer-tile-name">{getTileLabel(answerKanTile)}）</span>
                  </>
                ) : (
                  <>
                    <div className="tile-readonly">
                      <img src={getTileImageUrl(p.answer)} alt={getTileLabel(p.answer)} />
                    </div>
                    <span className="answer-tile-name">{getTileLabel(p.answer)}</span>
                  </>
                )}
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
    </div>
  );
}
