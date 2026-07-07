import { supabase } from '../lib/supabase';

// 問題画像は Supabase Storage の question-images バケット（限定公開）に置く。
// 閲覧は許可ユーザーのみ（RLS）なので、表示時に署名付きURLを発行する。

export const QUESTION_IMAGE_BUCKET = 'question-images';
const PUBLIC_URL_MARKER = `/${QUESTION_IMAGE_BUCKET}/`;

// question_image_url カラムの値を Storage 内のパスに正規化する。
// 旧データは公開URL全体（https://…/object/public/question-images/123.jpg）、
// 新データはファイル名（123.jpg）のどちらもあり得る
export function questionImagePath(value) {
  if (!value) return null;
  const i = value.indexOf(PUBLIC_URL_MARKER);
  return i >= 0 ? decodeURIComponent(value.slice(i + PUBLIC_URL_MARKER.length)) : value;
}

// 表示用の署名付きURLを発行する（既定1時間有効）。失敗時は null
export async function createQuestionImageSignedUrl(value, expiresIn = 3600) {
  const path = questionImagePath(value);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(QUESTION_IMAGE_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error('[questionImage] 署名付きURLの発行に失敗:', error);
    return null;
  }
  return data.signedUrl;
}
