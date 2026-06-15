/** Firestore コレクションパス（ユーザー単位でデータを分離） */
export function userRecordsPath(uid: string): string {
  return `users/${uid}/records`;
}

export function userMastersPath(uid: string): string {
  return `users/${uid}/settings/masters`;
}

export function userMaintenanceBillsPath(uid: string): string {
  return `users/${uid}/maintenanceBills`;
}

export function userVehicleExpensesPath(uid: string): string {
  return `users/${uid}/vehicleExpenses`;
}

export function userMetaPath(uid: string): string {
  return `users/${uid}/meta/app`;
}

export function userEmployeeDetailsPath(uid: string): string {
  return `users/${uid}/employee_details`;
}

export function userVehiclesPath(uid: string): string {
  return `users/${uid}/vehicles`;
}

export function userJobsPath(uid: string): string {
  return `users/${uid}/jobs`;
}

/** Amazon実績（生産性・経費管理） */
export function userAmazonPerformanceExpensesPath(uid: string): string {
  return `users/${uid}/amazonPerformanceExpenses`;
}

/** 滋賀店配×FM 傭車契約単価マスタ（移行期間のみ読取互換） */
export function userPartnerContractRatesPath(uid: string): string {
  return `users/${uid}/partner_contract_rates`;
}

/** 協力会社支払契約 */
export function userPartnerPaymentContractsPath(uid: string): string {
  return `users/${uid}/partner_payment_contracts`;
}

/** 荷主請求契約 */
export function userShipperBillingContractsPath(uid: string): string {
  return `users/${uid}/shipper_billing_contracts`;
}

/** 滋賀店配×FM 未登録スロット手入力 */
export function userShigaFmSlotAssignmentsPath(uid: string): string {
  return `users/${uid}/shiga_fm_slot_assignments`;
}

/** 滋賀店配×FM 月度セッション（取込・突合結果） */
export function userShigaFmSessionsPath(uid: string): string {
  return `users/${uid}/shiga_fm_sessions`;
}
