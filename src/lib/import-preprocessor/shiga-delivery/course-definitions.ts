import type { ShigaDeliveryCourseId } from "./types";

export type ShigaDeliveryCourseDefinition = {
  courseId: ShigaDeliveryCourseId;
  courseName: string;
  routeName: string;
  /** 台数列（0始まり） */
  startCol: number;
};

export const SHIGA_DELIVERY_COURSES: ShigaDeliveryCourseDefinition[] = [
  {
    courseId: "SHIGA_01",
    courseName: "滋賀地区①",
    routeName: "長浜ー彦根ー東近江ー近江八幡",
    startCol: 2,
  },
  {
    courseId: "SHIGA_02",
    courseName: "滋賀地区②",
    routeName: "水口ーイオン草津ー草津",
    startCol: 9,
  },
  {
    courseId: "SHIGA_03",
    courseName: "滋賀地区③",
    routeName: "今津ー西大津ー堅田",
    startCol: 16,
  },
  {
    courseId: "SHIGA_04",
    courseName: "滋賀地区④",
    routeName: "守山",
    startCol: 23,
  },
];

/** 日次合計列（0始まり） */
export const SHIGA_DAILY_TOTAL_COL = {
  vehicleAmount: 30,
  toll: 31,
  unitCount: 32,
  payTotal: 33,
} as const;

export const SHIGA_METADATA_ROW = {
  year: 0,
  month: 1,
  vendorCode: 3,
  vendorName: 4,
  vehicleType: 8,
} as const;

export const SHIGA_DATA_START_ROW_INDEX = 6;
