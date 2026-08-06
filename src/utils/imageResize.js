// アップロード前に問題画像を縮小する（ブラウザの canvas だけを使う。依存パッケージなし）。
//
// 牌譜のスクリーンショットは1枚1〜2MB あり、そのまま貯めると Storage の無料枠（1GB）を
// すぐ食う。出題のたびにその容量をダウンロードすることにもなる。
// 長辺 1600px・WebP 品質85 なら牌の判読には十分で、容量はおよそ 1/7 になる。
//
// ★ 変換に失敗したときは**元のファイルをそのまま返す**（アップロード自体は成立させる）。

export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_QUALITY  = 0.85;

/**
 * 長辺を maxEdge に収める寸法を返す（拡大はしない）。
 * canvas を使わない純粋関数なのでテストできる。
 */
export function fitSize(width, height, maxEdge = MAX_IMAGE_EDGE) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / longest);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * 画像ファイルを縮小して WebP の File にする。
 * 縮小しても小さくならなかった場合と、変換できなかった場合は元の file を返す。
 */
export async function shrinkImageFile(file, { maxEdge = MAX_IMAGE_EDGE, quality = IMAGE_QUALITY } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxEdge);
    if (width === 0 || height === 0) return file;

    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    // WebP に対応していないブラウザは null か、別形式の大きい blob を返す。
    // 元より大きくなるなら変換する意味が無いので元のまま上げる
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}
