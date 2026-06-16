麻雀何切るアプリの手牌スキャン＆修正ワークフローを実行してください。

引数: $ARGUMENTS
- 省略時: 全カテゴリーをスキャン（--resume で未処理分のみ）
- カテゴリー名指定時: そのカテゴリーのみスキャン（例: `1_リーチ判断`）
- `resume` と指定時: 前回の中断箇所から再開

## 実行手順

1. **APIキー確認**
   PowerShell で `$env:ANTHROPIC_API_KEY` が設定されているか確認する。
   未設定の場合は以下を案内して終了:
   ```
   $env:ANTHROPIC_API_KEY="sk-ant-..."
   ```

2. **スキャン実行**
   作業ディレクトリ `d:\ClaudeCode\麻雀何切るアプリ開発` で以下を実行:
   - 引数なし → `node scripts/generate-problems.mjs --resume`
   - カテゴリー指定 → `node scripts/generate-problems.mjs --category <カテゴリー名>`
   - resume指定 → `node scripts/generate-problems.mjs --resume`

3. **完了報告**
   スキャン完了後、成功/スキップ/エラーの件数を報告する。
   エラーがあれば `scripts/progress.json` の `errors` フィールドを確認するよう案内する。

4. **管理画面の案内**
   開発サーバーが起動していない場合は `npm run dev` を実行するか確認し、
   修正作業の URL を案内する:
   ```
   http://localhost:5173/admin.html
   ```
