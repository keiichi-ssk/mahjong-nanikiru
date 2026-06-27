import { useState, useEffect, useMemo } from 'react';
import TileButton from './TileButton';
import { getTileLabel, getTileImageUrl, randomSuitMap, remapProblem, getDoraIndicator } from '../utils/tileUtils';
import { getSituationText } from '../utils/categoryUtils';

const MELD_TYPE_LABELS = { chi: 'チー', pon: 'ポン', kan: '大明槓', kakan: '加槓', ankan: '暗槓' };

const NAKI_TIMING_OPTIONS = [
  { value: 'early', label: '序盤から鳴く' },
  { value: 'mid',   label: '中盤から鳴く' },
  { value: 'late',  label: '終盤から鳴く' },
  { value: 'no',    label: '鳴かない' },
];

function ExplanationText({ text }) {
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
    <p className="answer-explanation">
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
          const isRotated = type !== 'ankan' && i === 0;
          const isBack = type === 'ankan' && (i === 0 || i === 3);
          if (isBack) {
            return <div key={i} className="meld-tile meld-tile--back" />;
          }
          return (
            <div key={i} className={`meld-tile${isRotated ? ' meld-tile--rotated' : ''}`}>
              <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
            </div>
          );
        })}
      </div>
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

function HandDisplay({ tiles, melds }) {
  const hasMetlds = Array.isArray(melds) && melds.length > 0;
  if (!tiles || tiles.length === 0) return null;
  return (
    <div className="hand-and-melds">
      <div className="tile-display-readonly">
        {tiles.map((tile, i) => (
          <div key={`${tile}-${i}`} className="tile-readonly">
            <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
          </div>
        ))}
      </div>
      {hasMetlds && (
        <div className="melds-area">
          {melds.map((meld, i) => (
            <MeldDisplay key={i} meld={meld} />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== パターン1: 鳴きタイミング =====
function NakiTimingView({ problem, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const answered = selected !== null;
  const isCorrect = selected === problem.answer;

  function handleSelect(value) {
    if (answered) return;
    setSelected(value);
    onAnswer?.(value === problem.answer);
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

      <HandDisplay tiles={problem.tiles} melds={problem.melds} />

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
        <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
          <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
          <div className="answer-tile">
            <span className="answer-label">正解：</span>
            <span className="answer-tile-name">
              {NAKI_TIMING_OPTIONS.find(o => o.value === problem.answer)?.label ?? '未設定'}
            </span>
          </div>
          <ExplanationText text={problem.explanation} />
        </div>
      )}
    </>
  );
}

const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3 };
function sortChoices(choices) {
  return [...choices].sort((a, b) => {
    const sA = a.tile.slice(-1), sB = b.tile.slice(-1);
    if (sA !== sB) return SUIT_ORDER[sA] - SUIT_ORDER[sB];
    const nA = a.tile[0] === '0' ? 5.5 : parseInt(a.tile[0]);
    const nB = b.tile[0] === '0' ? 5.5 : parseInt(b.tile[0]);
    return nA - nB;
  });
}

// ===== パターン2: 鳴き選択 =====
function NakiChoiceView({ problem, onAnswer }) {
  const sortedChoices = sortChoices(problem.nakiChoices ?? []);
  const [selected, setSelected] = useState(new Set());
  const [answered, setAnswered] = useState(false);

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
  const isCorrect = answered &&
    selected.size === correctTiles.size &&
    [...selected].every(t => correctTiles.has(t));

  return (
    <>
      <HandDisplay tiles={problem.tiles} melds={problem.melds} />

      <p className="naki-choice-instruction">鳴く牌をすべて選んでください（複数選択可）</p>

      <div className="tile-selector">
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
          const correct = selected.size === correctTiles.size &&
            [...selected].every(t => correctTiles.has(t));
          setAnswered(true);
          onAnswer?.(correct);
        }}>
          答え合わせ
        </button>
      ) : (
        <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
          <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
          <div className="answer-tile">
            <span className="answer-label">正解：</span>
            {sortedChoices.filter(c => c.correct).map(c => (
              <div key={c.tile} className="tile-readonly">
                <img src={getTileImageUrl(c.tile)} alt={getTileLabel(c.tile)} />
              </div>
            ))}
            {correctTiles.size === 0 && <span className="answer-tile-name">なし（鳴かない）</span>}
          </div>
          <ExplanationText text={problem.explanation} />
        </div>
      )}
    </>
  );
}

// ===== メイン =====
export default function ProblemView({ problem, index, total, onBack, onPrev, onNext, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [selectedRiichi, setSelectedRiichi] = useState(null);
  const [suitMap, setSuitMap] = useState(() => randomSuitMap());

  useEffect(() => {
    setSuitMap(randomSuitMap());
    setSelected(null);
    setSelectedRiichi(null);
  }, [problem.id]);

  // image-quiz はスーツ置換すると画像と牌が食い違うためそのまま使う
  const p = useMemo(() => {
    if ((problem.problemType ?? 'default') === 'image-quiz') return problem;
    return remapProblem(problem, suitMap);
  }, [problem, suitMap]);

  const problemType   = (p.problemType === 'image-quiz' || !p.problemType) ? 'default' : p.problemType;
  const isRiichiJudgment = problemType === 'riichi-judgment' || (problemType === 'default' && p.section === '1_リーチ判断');
  const needsRiichi = !isRiichiJudgment && p.riichi !== null && p.riichi !== undefined;
  const answered = selected !== null;
  const hasMetlds = Array.isArray(p.melds) && p.melds.length > 0;

  const answerIsKan = typeof p.answer === 'string' && p.answer.startsWith('ankan:');
  const answerKanTile = answerIsKan ? p.answer.slice(6) : null;

  const quadTiles = useMemo(() => {
    const counts = {};
    for (const tile of p.tiles ?? []) counts[tile] = (counts[tile] ?? 0) + 1;
    return Object.keys(counts).filter(tile => counts[tile] === 4);
  }, [p.tiles]);

  const isCorrect = isRiichiJudgment
    ? selectedRiichi === p.riichi
    : selected === p.answer && (!needsRiichi || (selectedRiichi ?? false) === p.riichi);

  useEffect(() => {
    if (!answered) return;
    if (problemType === 'naki-timing' || problemType === 'naki-choice') return;
    onAnswer?.(problem.id, isCorrect);
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

      {(() => {
        const hasSituationFields = p.bakaze || p.jikaze || p.junme != null;
        const situationText = hasSituationFields
          ? [
              p.bakaze ? `${p.bakaze}場` : null,
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

      {/* ===== 鳴きタイミング ===== */}
      {problemType === 'naki-timing' && (
        <NakiTimingView problem={p} onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)} />
      )}

      {/* ===== 鳴き選択 ===== */}
      {problemType === 'naki-choice' && (
        <NakiChoiceView problem={p} onAnswer={isCorrect => onAnswer?.(problem.id, isCorrect)} />
      )}

      {/* ===== 問題画像（全タイプ共通） ===== */}
      {p.questionImageUrl && (
        <div className="question-image-wrap">
          <img src={p.questionImageUrl} alt="問題" className="question-image" />
        </div>
      )}

      {/* ===== リーチ判断 ===== */}
      {isRiichiJudgment && (
        <>
          {p.tiles && p.tiles.length > 0 && (
            <div className="hand-and-melds">
              <div className="tile-display-readonly">
                {p.tiles.map((tile, i) => (
                  <div key={`${tile}-${i}`} className="tile-readonly">
                    <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
                  </div>
                ))}
              </div>
              {hasMetlds && (
                <div className="melds-area">
                  {p.melds.map((meld, i) => (
                    <MeldDisplay key={i} meld={meld} />
                  ))}
                </div>
              )}
            </div>
          )}

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
            <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
              <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
              <div className="answer-tile">
                <span className="answer-label">正解：</span>
                <span className="answer-tile-name">
                  {p.riichi === true ? 'リーチ' : p.riichi === false ? 'ダマ' : '未設定'}
                </span>
              </div>
              <ExplanationText text={p.explanation} />
            </div>
          )}
        </>
      )}

      {/* ===== 通常の何切るカテゴリ ===== */}
      {problemType === 'default' && !isRiichiJudgment && (
        p.tiles && p.tiles.length > 0 ? (
          <>
            <div className="tile-selector-row">
              <div className="hand-and-melds">
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
                {hasMetlds && (
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
              <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
                <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
                <div className="answer-tile">
                  <span className="answer-label">正解：</span>
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
                </div>
                <ExplanationText text={p.explanation} />
              </div>
            )}
          </>
        ) : (
          <div className="pending-notice">
            この問題の回答・解説は準備中です
          </div>
        )
      )}

      <div className="problem-nav">
        <button className="btn-nav" onClick={onPrev} disabled={index === 0}>
          ← 前の問題
        </button>
        <button className="btn-nav" onClick={onNext} disabled={index === total - 1}>
          次の問題 →
        </button>
      </div>
    </div>
  );
}
