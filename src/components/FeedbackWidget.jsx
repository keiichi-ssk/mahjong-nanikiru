import { useState } from 'react';

// ご意見・ご要望の投稿ウィジェット（完全匿名・/api/feedback 経由で Supabase に保存）。
// Supabase クライアントは import しない（認証不要の公開ページでも使うため fetch のみで完結させる）。
// 定型チップはワンタップで送信、詳しく書きたい人だけ自由記述を使う2段構え
const PRESETS = [
  '問題を増やしてほしい',
  '解説を充実させてほしい',
  '使い方が分かりにくい',
  '不具合があった',
];

export default function FeedbackWidget({ source }) {
  const [open, setOpen] = useState(false);
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

  if (!open) {
    return (
      <div className="feedback-widget">
        <button className="feedback-toggle-btn" onClick={() => setOpen(true)}>
          ご意見・ご要望
        </button>
      </div>
    );
  }

  return (
    <div className="feedback-widget">
      <div className="feedback-panel">
        <div className="feedback-panel-header">
          <span className="feedback-panel-title">ご意見・ご要望</span>
          <button className="feedback-close-btn" onClick={() => { setOpen(false); setStatus(null); }}>
            閉じる
          </button>
        </div>

        <p className="feedback-note">匿名で送信されます。タップするだけで送れます。</p>

        <div className="feedback-chips">
          {PRESETS.map(label => (
            <button
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
    </div>
  );
}
