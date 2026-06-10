"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

function PopoverTrigger({
  className,
  ...props
}: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverPositioner({
  className,
  side = "top",
  sideOffset = 6,
  align = "end",
  ...props
}: PopoverPrimitive.Positioner.Props) {
  return (
    <PopoverPrimitive.Positioner
      data-slot="popover-positioner"
      side={side}
      sideOffset={sideOffset}
      align={align}
      className={cn("isolate z-50", className)}
      {...props}
    />
  );
}

function PopoverPopup({
  className,
  ...props
}: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-popup"
      className={cn(
        "relative z-50 w-[min(100vw-2rem,18rem)] origin-(--transform-origin) rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className,
      )}
      {...props}
    />
  );
}

function PopoverArrow({ className, ...props }: PopoverPrimitive.Arrow.Props) {
  return (
    <PopoverPrimitive.Arrow
      data-slot="popover-arrow"
      className={cn(
        "flex data-[side=bottom]:-top-2 data-[side=bottom]:rotate-180 data-[side=left]:-right-2 data-[side=left]:rotate-90 data-[side=right]:-left-2 data-[side=right]:-rotate-90 data-[side=top]:-bottom-2",
        className,
      )}
      {...props}
    >
      <svg width="12" height="6" viewBox="0 0 12 6" aria-hidden>
        <path
          d="M0 6L6 0L12 6"
          className="fill-popover stroke-border"
          strokeWidth="1"
        />
      </svg>
    </PopoverPrimitive.Arrow>
  );
}

export {
  Popover,
  PopoverArrow,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
};
