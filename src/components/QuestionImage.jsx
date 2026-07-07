import { useState, useEffect } from 'react';
import { createQuestionImageSignedUrl } from '../utils/questionImage';

// 問題画像の表示。question_image_url の値（旧: 公開URL / 新: ファイル名）から
// 署名付きURLを発行して表示する。未設定・発行失敗・読み込み中は何も描画しない
export default function QuestionImage({ value, alt = '問題', wrapClassName, imgClassName }) {
  // どの value に対する署名URLかをセットで持ち、value が変わったら描画側で無効化する
  const [signed, setSigned] = useState(null); // { value, url } | null

  useEffect(() => {
    if (!value) return undefined;
    let cancelled = false;
    createQuestionImageSignedUrl(value).then(url => {
      if (!cancelled) setSigned({ value, url });
    });
    return () => { cancelled = true; };
  }, [value]);

  const url = signed && signed.value === value ? signed.url : null;
  if (!url) return null;
  return (
    <div className={wrapClassName}>
      <img src={url} alt={alt} className={imgClassName} />
    </div>
  );
}
