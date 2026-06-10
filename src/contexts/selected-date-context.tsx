"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  dateWithYearMonth,
  isIsoDate,
  isYearMonth,
  loadSelectedDate,
  saveSelectedDate,
} from "@/lib/selected-date-storage";

type SelectedDateContextValue = {
  /** 選択中の日付（YYYY-MM-DD） */
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  /** 選択日付の年月部分（YYYY-MM） */
  selectedYearMonth: string;
  setSelectedYearMonth: (yearMonth: string) => void;
};

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null);

export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDateState] = useState(loadSelectedDate);

  const setSelectedDate = useCallback((date: string) => {
    if (!isIsoDate(date)) return;
    setSelectedDateState(date);
    saveSelectedDate(date);
  }, []);

  const setSelectedYearMonth = useCallback((yearMonth: string) => {
    if (!isYearMonth(yearMonth)) return;
    setSelectedDateState((prev) => {
      const next = dateWithYearMonth(yearMonth, prev);
      saveSelectedDate(next);
      return next;
    });
  }, []);

  const value = useMemo(
    (): SelectedDateContextValue => ({
      selectedDate,
      setSelectedDate,
      selectedYearMonth: selectedDate.slice(0, 7),
      setSelectedYearMonth,
    }),
    [selectedDate, setSelectedDate, setSelectedYearMonth],
  );

  return (
    <SelectedDateContext.Provider value={value}>
      {children}
    </SelectedDateContext.Provider>
  );
}

export function useSelectedDate(): SelectedDateContextValue {
  const ctx = useContext(SelectedDateContext);
  if (!ctx) {
    throw new Error("useSelectedDate must be used within SelectedDateProvider");
  }
  return ctx;
}
