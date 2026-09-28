import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        // Senior test T1 (2026-09-27): this was the stock light textarea
        // (bg-white, dark: variants). The Suite never sets the dark class,
        // so every textarea without its own background was white with the
        // page's light text inherited: typed text all but invisible. It now
        // matches Input.
        "flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border-pl-border-strong bg-pl-surface text-pl-text ring-offset-pl-bg placeholder:text-pl-muted focus-visible:ring-pl-focus",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }