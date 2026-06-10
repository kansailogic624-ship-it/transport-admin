/** ブラウザに保存する選択日付のキー */
export const SELECTED_DATE_STORAGE_KEY = "selected_date";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function isYearMonth(value: string): boolean {
  return YEAR_MONTH_RE.test(value);
}

export function loadSelectedDate(): string {
  if (typeof window === "undefined") return todayIso();
  try {
    const stored = localStorage.getItem(SELECTED_DATE_STORAGE_KEY);
    if (stored && isIsoDate(stored)) return stored;
  } catch {
    /* localStorage 不可時は今日 */
  }
  return todayIso();
}

export function saveSelectedDate(date: string): void {
  if (typeof window === "undefined" || !isIsoDate(date)) return;
  try {
    localStorage.setItem(SELECTED_DATE_STORAGE_KEY, date);
  } catch {
    /* 保存失敗は無視 */
  }
}

/** 月変更時に日を維持しつつ、その月の末日でクランプ */
export function dateWithYearMonth(yearMonth: string, currentDate: string): string {
  if (!isYearMonth(yearMonth)) return currentDate;
  const day = Number(currentDate.slice(8, 10)) || 1;
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return `${yearMonth}-${String(clamped).padStart(2, "0")}`;
}
