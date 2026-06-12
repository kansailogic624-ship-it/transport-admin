# FM社員スケジュール — 業務用修正画面 設計書（v2）

## 追加要件（v2）

### 判定理由の表示
修正画面に「なぜ共同作業と判定されたか」を表示する。

| 理由コード | 表示例 |
|-----------|--------|
| `same_joint_job` | 同業務（日付・荷主・業務が一致） |
| `same_vehicle` | 同車番 |
| `time_overlap` | 時間重複（重複率 XX%） |
| `same_job` | 同業務名 |
| `note_detected` | 備考欄検出 |
| `excel_multi_member` | Excel上で複数社員行 |

### 修正履歴
各エントリに **修正日時・修正者・変更前・変更後** を必ず保存する。

### 警告対応状態（3状態）

| 状態 | 内部キー | 説明 |
|------|---------|------|
| 要修正 | `needs_action` | 未対応。件数に含む |
| 問題なし | `dismissed_ok` | 誤検知として閉じた |
| 保留 | `on_hold` | 後で確認 |

### 警告件数（分離表示）
- 未対応警告件数
- 問題なし件数
- 保留件数

## Phase 1 実装範囲（完了）
1. 警告3状態 + 件数分離（`warning-tracking.ts` / `warning-actions.ts`）
2. 修正画面への判断統合（インラインパネル廃止 → `FmScheduleEditScreen`）
3. 判定理由表示（`joint-detection-reasons.ts`）
4. 保存再計算の一本化（`fm-record-edit-session.ts`）
5. 修正履歴に修正者を記録（`manualEditHistory`）
6. サマリーに未対応 / 問題なし / 保留件数を分離表示

## Phase 2（後続）
- フィルタ完全統一、`originalState` 拡張、元に戻す強化
