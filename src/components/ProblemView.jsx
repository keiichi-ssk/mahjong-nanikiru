import { useState } from 'react';
import TileButton from './TileButton';
import { getTileLabel, getTileImageUrl } from '../utils/tileUtils';

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
function NakiTimingView({ problem }) {
  const [selected, setSelected] = useState(null);
  const answered = selected !== null;
  const isCorrect = selected === problem.answer;

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
              onClick={() => setSelected(opt.value)}
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
function NakiChoiceView({ problem }) {
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
        <button className="naki-choice-submit-btn" onClick={() => setAnswered(true)}>
          答え合わせ
        </button>
      ) : (
        <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
          <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
          <div className="answer-tile">
            <span className="answer-label">正解：</span>
            {sortedChoices.filter(c => c.correct).map(c => (
              <img key={c.tile} src={getTileImageUrl(c.tile)} alt={getTileLabel(c.tile)} className="answer-tile-image" />
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
export default function ProblemView({ problem, index, total, onBack, onPrev, onNext }) {
  const [selected, setSelected] = useState(null);
  const [selectedRiichi, setSelectedRiichi] = useState(null);

  const problemType   = problem.problemType ?? 'default';
  const isRiichiCategory = problem.section === '1_リーチ判断';
  const needsRiichi = !isRiichiCategory && problem.riichi !== null && problem.riichi !== undefined;
  const answered = selected !== null;
  const hasMetlds = Array.isArray(problem.melds) && problem.melds.length > 0;

  const isCorrect = isRiichiCategory
    ? selectedRiichi === problem.riichi
    : selected === problem.answer && (!needsRiichi || selectedRiichi === problem.riichi);

  function handleSelect(tile) {
    if (!answered) setSelected(tile);
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
    if (tile === problem.answer) return 'correct';
    if (tile === selected) return 'wrong';
    return 'disabled';
  }

  return (
    <div className="problem-view">
      <div className="problem-header">
        <button className="btn-back" onClick={onBack}>← 一覧へ</button>
        <span className="problem-counter">問題 {index + 1} / {total}</span>
      </div>

      <h2 className="problem-question">
        {isRiichiCategory
          ? 'リーチ or ダマ？'
          : problemType === 'naki-timing'
            ? 'いつ鳴く？'
            : problemType === 'naki-choice'
              ? '何が出たら鳴く？'
              : '何を切る？'}
      </h2>

      {problem.dora && (
        <div className="dora-display">
          <span className="dora-label">ドラ</span>
          <img
            src={getTileImageUrl(problem.dora)}
            alt={getTileLabel(problem.dora)}
            className="dora-tile-image"
          />
          <span className="dora-tile-name">{getTileLabel(problem.dora)}</span>
        </div>
      )}

      <div className="problem-image-wrapper">
        <img
          src={problem.image}
          alt={`問題${problem.id}`}
          className="problem-image"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextElementSibling.style.display = 'flex';
          }}
        />
        <div className="problem-image-placeholder" style={{ display: 'none' }}>
          <span>画像未登録 (問題 {problem.id})</span>
        </div>
      </div>

      {/* ===== 鳴きタイミング ===== */}
      {problemType === 'naki-timing' && (
        <NakiTimingView problem={problem} />
      )}

      {/* ===== 鳴き選択 ===== */}
      {problemType === 'naki-choice' && (
        <NakiChoiceView problem={problem} />
      )}

      {/* ===== リーチ判断カテゴリ ===== */}
      {problemType === 'default' && isRiichiCategory && (
        <>
          {problem.tiles && problem.tiles.length > 0 && (
            <div className="hand-and-melds">
              <div className="tile-display-readonly">
                {problem.tiles.map((tile, i) => (
                  <div key={`${tile}-${i}`} className="tile-readonly">
                    <img src={getTileImageUrl(tile)} alt={getTileLabel(tile)} />
                  </div>
                ))}
              </div>
              {hasMetlds && (
                <div className="melds-area">
                  {problem.melds.map((meld, i) => (
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
                  {problem.riichi === true ? 'リーチ' : problem.riichi === false ? 'ダマ' : '未設定'}
                </span>
              </div>
              <ExplanationText text={problem.explanation} />
            </div>
          )}
        </>
      )}

      {/* ===== 通常の何切るカテゴリ ===== */}
      {problemType === 'default' && !isRiichiCategory && (
        problem.tiles && problem.tiles.length > 0 ? (
          <>
            <div className="tile-selector-row">
              <div className="hand-and-melds">
                <div className="tile-selector">
                  {problem.tiles.map((tile, i) => (
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
                    {problem.melds.map((meld, i) => (
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

            {answered && (
              <div className={`answer-panel ${isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`}>
                <div className="answer-result">{isCorrect ? '正解！' : '不正解'}</div>
                <div className="answer-tile">
                  <span className="answer-label">正解：</span>
                  <img
                    src={getTileImageUrl(problem.answer)}
                    alt={getTileLabel(problem.answer)}
                    className="answer-tile-image"
                  />
                  <span className="answer-tile-name">{getTileLabel(problem.answer)}</span>
                  {needsRiichi && (
                    <span className="answer-riichi">
                      {problem.riichi ? '・リーチする' : '・リーチしない'}
                    </span>
                  )}
                </div>
                <ExplanationText text={problem.explanation} />
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
