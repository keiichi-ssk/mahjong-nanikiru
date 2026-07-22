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

  if (mode === 'practice') {
    return <ChinitsuTrainer onBack={onBack} onTimeAttack={() => setMode('timeattack')} />;
  }
  return <ChinitsuTimeAttack onBack={onBack} onPractice={() => setMode('practice')} />;
}
