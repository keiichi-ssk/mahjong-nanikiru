// Vite向けの拡張子なしrelativeインポート（例: from './tileUtils'）を、
// 素のNodeから import できるように解決するローダー。src/utils配下のファイルは
// Vite/Node両方から読めるよう拡張子なしで統一されているため、ここで橋渡しする。
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}
