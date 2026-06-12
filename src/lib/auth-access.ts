/** 社員台帳（個人情報）へのアクセスを許可する社長アカウント */
export const PRESIDENT_EMAIL = "akihiro.ohnishi@kansailogic.jp";

export function canAccessEmployeeLedger(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === PRESIDENT_EMAIL.toLowerCase();
}
