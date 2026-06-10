"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatCurrencyInputValue,
  parseCurrencyInput,
  safeNumber,
} from "@/lib/currency-format";

type CurrencyInputProps = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** フォーカス中もカンマを挿入する */
  formatWhileTyping?: boolean;
};

/**
 * 金額入力コンポーネント。
 * - 表示時: 3桁カンマ区切り
 * - 内部値: 純粋な数値（NaN にならない）
 * - フォーカスアウト時にフォーマット適用
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  placeholder = "0",
  disabled,
  id,
  formatWhileTyping = false,
}: CurrencyInputProps) {
  const safeVal = safeNumber(value);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!focused) {
      setDraft(formatCurrencyInputValue(safeVal));
    }
  }, [safeVal, focused]);

  const commit = useCallback(
    (raw: string) => {
      const n = parseCurrencyInput(raw);
      onChange(n);
      return n;
    },
    [onChange],
  );

  const handleFocus = () => {
    setFocused(true);
    setDraft(safeVal === 0 ? "" : String(safeVal));
  };

  const handleBlur = () => {
    setFocused(false);
    const n = commit(draft);
    setDraft(formatCurrencyInputValue(n));
  };

  const handleChange = (raw: string) => {
    if (formatWhileTyping) {
      const digits = raw.replace(/[^\d]/g, "");
      const n = parseCurrencyInput(digits);
      setDraft(digits ? formatCurrencyInputValue(n) : "");
      onChange(n);
    } else {
      setDraft(raw);
      onChange(parseCurrencyInput(raw));
    }
  };

  const display = focused
    ? draft
    : formatCurrencyInputValue(safeVal);

  return (
    <Input
      id={id}
      className={cn("text-right tabular-nums", className)}
      inputMode="numeric"
      placeholder={placeholder}
      disabled={disabled}
      value={display}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
