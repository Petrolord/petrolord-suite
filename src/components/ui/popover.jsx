import React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { usePortalThemeProps } from "@/design/themeContext";

// Design system: overlay classes merged over the legacy ones only inside an
// opted-in <ThemedApp> scope (tailwind-merge swaps the colours). Portal
// content carries data-pl-theme itself because it renders outside the scope.
const THEMED = {
  content: "border-pl-border bg-pl-raised text-pl-text shadow-pl-md",
};

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  const portalProps = usePortalThemeProps();
  return (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      {...portalProps}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border border-slate-700 bg-slate-900 p-0 text-slate-50 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        THEMED.content, className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }