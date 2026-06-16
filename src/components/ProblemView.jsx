import { useState } from 'react';
import TileButton from './TileButton';
import { getTileLabel, getTileImageUrl } from '../utils/tileUtils';

const MELD_TYPE_LABELS = { chi: 'チー', pon: 'ポン', kan: '大明槓', kakan: '加槓', ankan: '暗槓' };

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

export default function ProblemView({ problem, index, total, onBack, onPrev, onNext }) {
  const [selected, setSelected] = useState(null);
  const [selectedRiichi, setSelectedRiichi] = useState(null);

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
        {isRiichiCategory ? 'リーチ or ダマ？' : '何を切る？'}
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

      {/* ===== リーチ判断カテゴリ ===== */}
      {isRiichiCategory ? (
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
              <p className="answer-explanation">{problem.explanation}</p>
            </div>
          )}
        </>
      ) : (
        /* ===== 通常の何切るカテゴリ ===== */
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
                <p className="answer-explanation">{problem.explanation}</p>
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
