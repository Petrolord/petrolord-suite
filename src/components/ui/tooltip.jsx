import * as React from "react"
    import * as TooltipPrimitive from "@radix-ui/react-tooltip"

    import { cn } from "@/lib/utils"
    import { usePortalThemeProps } from "@/design/themeContext";

// Design system: overlay classes merged over the legacy ones only inside an
// opted-in <ThemedApp> scope (tailwind-merge swaps the colours). Portal
// content carries data-pl-theme itself because it renders outside the scope.
const THEMED = {
  content: "border-transparent bg-pl-text text-pl-surface shadow-pl-md",
};

    const TooltipProvider = TooltipPrimitive.Provider

    const Tooltip = TooltipPrimitive.Root

    const TooltipTrigger = TooltipPrimitive.Trigger

    const TooltipContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => {
  const portalProps = usePortalThemeProps();
  return (
      <TooltipPrimitive.Content
        ref={ref}
      {...portalProps}
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          THEMED.content, className
        )}
        {...props}
      />
    );
})
    TooltipContent.displayName = TooltipPrimitive.Content.displayName

    export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }