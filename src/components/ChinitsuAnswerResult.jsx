import { getTileImageUrl, getTileLabel, compareTiles } from '../utils/tileUtils';

// メンチン何切るドリルの「解答パネル」（正解／不正解・最善の打牌・待ち牌などの解説）。
// 通常モード(ChinitsuTrainer)とタイムアタックモード(ChinitsuTimeAttack)で共有する。
// result（judge 結果オブジェクト）の mode ごとに表示を出し分ける。footer には各モードが
// パネル末尾に置きたい要素（シェアボタン／次の問題へボタン等）を渡す。
function TileList({ tiles }) {
  return tiles.map(t => (
    <div key={t} className="tile-readonly">
      <img src={getTileImageUrl(t)} alt={getTileLabel(t)} />
    </div>
  ));
}

export default function ChinitsuAnswerResult({ result, discarded, footer }) {
  if (!result) return null;

  const panelClass = `answer-panel ${result.isCorrect ? 'answer-panel--correct' : 'answer-panel--wrong'}`;

  if (result.mode === 'agari') {
    return (
      <div className={panelClass}>
        <div className="answer-result">{result.isCorrect ? '正解！' : '不正解'}</div>
        <div className="answer-tile">
          <span className="answer-tile-name">
            {result.isCorrect
              ? 'この手牌はアガリの形でした。ツモの宣言で正解です。'
              : 'この手牌はまだアガリの形ではありません（ツモではありません）。'}
          </span>
        </div>
        {footer}
      </div>
    );
  }

  if (result.mode === 'missed-agari') {
    return (
      <div className="answer-panel answer-panel--wrong">
        <div className="answer-result">不正解</div>
        <div className="answer-tile">
          <span className="answer-tile-name">
            この手牌は既にアガリの形（ツモ）でした。ツモを見逃しています。
          </span>
        </div>
        {footer}
      </div>
    );
  }

  if (result.mode === 'noten') {
    return (
      <div className={panelClass}>
        <div className="answer-result">{result.isCorrect ? '正解！' : '不正解'}</div>
        {result.isCorrect ? (
          <div className="answer-tile">
            <span className="answer-tile-name">この手牌はどの牌を切ってもテンパイになりません。</span>
          </div>
        ) : (
          <div className="answer-tile">
            <span className="answer-label">最善の打牌：</span>
            <TileList tiles={result.bestTiles} />
            <span className="answer-tile-name">（受け入れ{result.maxUkeire}枚でテンパイ）</span>
          </div>
        )}
        {footer}
      </div>
    );
  }

  if (result.mode === 'discard') {
    return (
      <div className={panelClass}>
        <div className="answer-result">{result.isCorrect ? '正解！' : '不正解'}</div>

        <div className="answer-tile">
          <span className="answer-label">切った牌：</span>
          <TileList tiles={[discarded]} />
          <span className="answer-tile-name">（受け入れ{result.actualAnalysis.ukeire}枚）</span>
        </div>

        <div className="answer-tile">
          <span className="answer-label">回答した待ち：</span>
          <TileList tiles={[...result.waits].sort(compareTiles)} />
        </div>

        <div className="answer-tile">
          <span className="answer-label">最善の打牌：</span>
          <TileList tiles={result.bestTiles} />
          <span className="answer-tile-name">（受け入れ{result.maxUkeire}枚）</span>
        </div>

        <div className="answer-tile">
          <span className="answer-label">最善の打牌時の待ち：</span>
          <TileList tiles={result.bestWaits} />
        </div>

        {result.isValueMiss && (
          <p className="answer-value-miss">
            受け入れ枚数は最善と同じですが、最善の打牌は
            <strong>{result.bestYaku.join('・')}</strong>
            が付くぶん打点で上回ります。
          </p>
        )}
        {footer}
      </div>
    );
  }

  return null;
}
