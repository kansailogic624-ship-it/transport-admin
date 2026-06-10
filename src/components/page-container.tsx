import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PAGE_CONTAINER_CLASS } from "@/lib/page-layout";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

/** 全画面共通幅（.page-container）でラップする補助コンポーネント */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn(PAGE_CONTAINER_CLASS, className)}>{children}</div>
  );
}
