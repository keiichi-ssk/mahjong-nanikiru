import { useEffect } from 'react';

/**
 * chinitsu.html の静的な説明（フッターの .chinitsu-about）を、出題中は隠す（2026-11-04〜）。
 * 説明は JS を実行しない検索エンジン向けに静的HTMLで置いてあるので、消さずに hidden で出し分ける。
 * 表示するのはタイムアタックの開始前・結果画面だけ（出題中と練習モードでは隠す）。
 */
export function useChinitsuAboutVisible(visible) {
  useEffect(() => {
    const footer = document.querySelector('.app-footer');
    if (footer) footer.hidden = !visible;
  }, [visible]);
}
