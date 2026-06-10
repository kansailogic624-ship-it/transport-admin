"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type MasterSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function MasterSearchInput({
  value,
  onChange,
  placeholder,
}: MasterSearchInputProps) {
  return (
    <div className="relative max-w-md">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}
