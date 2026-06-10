/**
 * 全画面共通のコンテンツ幅（中央寄せ 85% / スマホ 95%、最大 1200px）
 *
 * - 実体のスタイル定義: src/app/globals.css の `.page-container`
 * - 新規ページは layout の main に自動適用。局所ラップは `PageContainer` または `PAGE_CONTAINER_CLASS`
 */
export const PAGE_CONTAINER_CLASS = "page-container";

/** ページ内の余白付きシェル（layout の main で使用） */
export const PAGE_SHELL_CLASS =
  "page-container min-w-0 flex-1 px-4 py-4 md:px-8 md:py-8";

/** @deprecated PAGE_CONTAINER_CLASS を使用（max-width は .page-container で定義） */
export const PAGE_MAX_WIDTH_CLASS = "max-w-[1200px]";

/** マスタ登録・給与設定などのカード2列グリッド */
export const PAGE_GRID_2COL_CLASS = "grid grid-cols-1 gap-6 md:grid-cols-2";

/** 管理チェック詳細モーダル（日次入力の1カラム幅に相当） */
export const CHECK_DETAIL_MODAL_CLASS = "max-w-lg";
