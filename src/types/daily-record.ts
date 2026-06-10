export type Trip = {
  id: string;
  vehicleNumber: string;
  shipperName: string;
  revenue: string;
  startMeter: string;
  endMeter: string;
};

export type DailyRecord = {
  id: string;
  date: string;
  driverName: string;
  clockIn: string;
  clockOut: string;
  rollCallTime: string;
  reportStatus: "submitted" | "not_submitted" | "not_required";
  trips: Trip[];
  createdAt: string;
};

export type RecordAlert = {
  code: "distance" | "roll-call" | "daily-report";
  message: string;
};
