import { useState } from 'react';
import ChinitsuTrainer from './ChinitsuTrainer';
import ChinitsuTimeAttack from './ChinitsuTimeAttack';

// メンチン何切るドリルの入口。タイムアタックを既定とし、練習モード（じっくり何切る）と相互に行き来する。
// ただし ?q=（Xで共有された手牌）付きで開かれたときは、その手牌を出題するため練習モードで起動する
// （これがないと共有リンクを開いてもタイムアタック画面になり、手牌シェア機能が成立しない）。
function initialMode() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('q')) {
    return 'practice';
  }
  return 'timeattack';
}

export default function ChinitsuDrill({ onBack }) {
  const [mode, setMode] = useState(initialMode);
  // タイムアタックの結果画面「間違えた問題を復習」から渡された、直前のセッションの誤答手牌。
  // null=通常の練習出題。配列なら練習モードを復習モードで開始する（その手牌だけを出題）
  const [reviewHands, setReviewHands] = useState(null);

  if (mode === 'practice') {
    return (
      <ChinitsuTrainer
        onBack={onBack}
        onTimeAttack={() => { setReviewHands(null); setMode('timeattack'); }}
        reviewHands={reviewHands}
      />
    );
  }
  return (
    <ChinitsuTimeAttack
      onBack={onBack}
      onPractice={() => { setReviewHands(null); setMode('practice'); }}
      onReview={(hands) => { setReviewHands(hands); setMode('practice'); }}
    />
  );
}
