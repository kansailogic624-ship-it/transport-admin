"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MasterSearchInput } from "@/components/master-search-input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { matchesTextSearch } from "@/lib/master-search";

type MasterListCardProps = {
  title: string;
  description: string;
  placeholder: string;
  searchPlaceholder: string;
  items: string[];
  listMaxHeightClass?: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
};

export function MasterListCard({
  title,
  description,
  placeholder,
  searchPlaceholder,
  items,
  listMaxHeightClass = "max-h-48",
  onAdd,
  onRemove,
}: MasterListCardProps) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const filteredItems = items.filter((item) => matchesTextSearch(search, item));

  const handleAdd = () => {
    if (!input.trim()) return;
    onAdd(input);
    setInput("");
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <MasterSearchInput
          value={search}
          onChange={setSearch}
          placeholder={searchPlaceholder}
        />
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" onClick={handleAdd} size="icon" variant="secondary">
            <Plus className="size-4" />
            <span className="sr-only">追加</span>
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ登録がありません</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            「{search}」に一致する項目はありません
          </p>
        ) : (
          <ul
            className={`min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2 ${listMaxHeightClass}`}
          >
            {filteredItems.map((item) => (
              <li
                key={item}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <span>{item}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => {
                    if (confirm(`「${item}」をマスタから削除しますか？`)) {
                      onRemove(item);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  削除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
