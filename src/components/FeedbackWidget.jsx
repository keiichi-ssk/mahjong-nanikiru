import { useRef, useState } from 'react';

// ご意見・ご要望の投稿ウィジェット（完全匿名・/api/feedback 経由で Supabase に保存）。
// Supabase クライアントは import しない（認証不要の公開ページでも使うため fetch のみで完結させる）。
// 定型チップはワンタップで送信、詳しく書きたい人だけ自由記述を使う2段構え
const PRESETS = [
  '問題を増やしてほしい',
  '解説を充実させてほしい',
  '使い方が分かりにくい',
  '不具合があった',
];

function useFeedbackSender(source) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | 'error'

  async function send(message) {
    if (status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, source }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus('sent');
      setText('');
    } catch {
      setStatus('error');
    }
  }

  return { text, setText, status, setStatus, send };
}

// 入力フォーム本体（インライン表示とダイアログ表示で共用）
function FeedbackForm({ sender, onClose }) {
  const { text, setText, status, send } = sender;
  return (
    <div className="feedback-panel">
      <div className="feedback-panel-header">
        <span className="feedback-panel-title">ご意見・ご要望</span>
        <button type="button" className="feedback-close-btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      <p className="feedback-note">匿名で送信されます。タップするだけで送れます。</p>

      <div className="feedback-chips">
        {PRESETS.map(label => (
          <button
            type="button"
            key={label}
            className="feedback-chip"
            disabled={status === 'sending'}
            onClick={() => send(label)}
          >
            {label}
          </button>
        ))}
      </div>

      <textarea
        className="feedback-textarea"
        placeholder="自由にご記入ください（500文字まで）"
        maxLength={500}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className="feedback-send-btn"
        disabled={status === 'sending' || text.trim().length === 0}
        onClick={() => send(text.trim())}
      >
        {status === 'sending' ? '送信中…' : '送信する'}
      </button>

      {status === 'sent' && (
        <p className="feedback-status feedback-status--ok">送信しました。ありがとうございます！</p>
      )}
      {status === 'error' && (
        <p className="feedback-status feedback-status--error">送信できませんでした。時間をおいてお試しください。</p>
      )}
    </div>
  );
}

/**
 * variant="inline"（既定）: ボタンを押すとその場にフォームが開く（chinitsu.html のフッター用）
 * variant="header": ヘッダー右上のアイコンボタン。押すとダイアログ（<dialog>）でフォームを開く（2026-11-04〜）
 */
export default function FeedbackWidget({ source, variant = 'inline' }) {
  const sender = useFeedbackSender(source);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);

  if (variant === 'header') {
    const close = () => {
      dialogRef.current?.close();
    };
    return (
      <>
        <button
          type="button"
          className="feedback-header-btn"
          aria-label="ご意見・ご要望"
          onClick={() => dialogRef.current?.showModal()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="feedback-header-label">ご意見・ご要望</span>
        </button>
        {/* 閉じたら送信結果の表示をリセットする（次に開いたとき前回の「送信しました」を出さない） */}
        <dialog
          ref={dialogRef}
          className="feedback-dialog"
          onClose={() => sender.setStatus(null)}
          // 背景（ダイアログの外側）のクリックで閉じる。中身のクリックは target が子要素になる
          onClick={(e) => { if (e.target === dialogRef.current) close(); }}
        >
          <FeedbackForm sender={sender} onClose={close} />
        </dialog>
      </>
    );
  }

  if (!open) {
    return (
      <div className="feedback-widget">
        <button type="button" className="feedback-toggle-btn" onClick={() => setOpen(true)}>
          ご意見・ご要望
        </button>
      </div>
    );
  }

  return (
    <div className="feedback-widget">
      <FeedbackForm sender={sender} onClose={() => { setOpen(false); sender.setStatus(null); }} />
    </div>
  );
}
