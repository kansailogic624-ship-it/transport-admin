/**
 * Playwright が入っている場合のみ: ブラウザで /seed?apply=1 を開いて投入
 * 通常はブラウザで http://localhost:3000/seed?apply=1 を開いてください
 */
console.log(`
========================================
  Sample data load (browser required)
========================================

1. Start the app (run-app.bat)
2. Open in browser:

   http://localhost:3000/seed?apply=1

   (or http://localhost:3001/seed?apply=1)

3. Go to home, open "月次集計" tab, select 2026-05

Backup JSON: public/sample-may2026-backup.json
Restore via マスタ登録 > バックアップ > 復元
========================================
`);
