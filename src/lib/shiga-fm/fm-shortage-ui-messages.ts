/** FM不足行に関する画面上の説明文言（突合・傭車入力で共通） */

export const FM_SHORTAGE_EXPLANATION =
  "FM不足行は、FMスケジュールに登録がない業務です。協力会社台帳に契約があっても自動では確定しません。傭車・アルバイト入力から支払先を選択してください。";

export const CONTRACT_REGISTERED_VS_CONFIRMED =
  "協力会社台帳の「契約登録済み」は単価マスタの登録であり、この行の支払先が確定したこととは別です。FM不足行は傭車入力で支払先を選ぶまで確定しません。";

export const RECONCILE_CONTRACT_REFRESH_NOTE =
  "台帳で単価を更新した場合は「再突合する」で最新の支払・請求契約を読み込みます。手入力済み行は最新単価で再計算されます（FM不足行は引き続き傭車入力が必要です）。";

export const PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE =
  "台帳の契約単価を更新しました。滋賀FM突合に反映するには再突合が必要です。ただし、FM不足行は台帳登録だけでは確定せず、傭車・アルバイト入力が別途必要です。";

/** 荷主請求契約保存成功時の滋賀FM影響（支払契約文言とは別） */
export const SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE =
  "荷主請求契約を更新しました。滋賀FM突合に反映するには再突合が必要です。FM不足行は台帳登録だけでは確定せず、傭車・アルバイト入力が別途必要です。";

/** 協力会社台帳（支払契約）保存成功時の detail に滋賀FM影響説明を付与 */
export function withPartnerLedgerShigaFmNote(detail?: string): string {
  if (detail?.trim()) {
    return `${detail.trim()}\n${PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE}`;
  }
  return PARTNER_LEDGER_CONTRACT_SAVED_SHIGA_FM_NOTE;
}

/** 荷主台帳（請求契約）保存成功時の detail に滋賀FM影響説明を付与 */
export function withShipperBillingLedgerShigaFmNote(detail?: string): string {
  if (detail?.trim()) {
    return `${detail.trim()}\n${SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE}`;
  }
  return SHIPPER_BILLING_CONTRACT_SAVED_SHIGA_FM_NOTE;
}

export function formatRecommendedPartnersHint(
  recommendedNames: string[],
  hasOther: boolean,
): string {
  if (recommendedNames.length > 0) {
    return `推奨候補：${recommendedNames.join("、")}`;
  }
  if (hasOther) {
    return "推奨候補なし。その他の協力会社から選択できます";
  }
  return "推奨候補なし。協力会社台帳で協力会社を登録してください";
}
