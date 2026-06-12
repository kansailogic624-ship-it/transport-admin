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
