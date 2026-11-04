import { useTheme } from '../utils/theme';

/**
 * ヘッダー右上のライト／ダーク切り替え（2026-11-04〜）。
 * 押すたびにライトとダークを切り替え、その選択を保存する（保存するまでは端末の設定に従う）。
 * アイコンは「押すとどうなるか」を示す（ライト表示中は月＝ダークにする、ダーク表示中は太陽＝ライトにする）。
 * 見た目は .header-icon-btn（ご意見・ご要望のアイコンボタンと同じ）。
 */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const toDark = theme === 'light';
  const label = toDark ? 'ダークモードにする' : 'ライトモードにする';
  return (
    <button type="button" className="header-icon-btn" aria-label={label} title={label} onClick={toggle}>
      {toDark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
