import * as React from "react"

import { cn } from "@/lib/utils"
import { useDsTheme } from "@/design/themeContext"
import { FIELD_THEMED } from "@/components/ui/input"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    (<textarea
      className={cn(
        // Senior test T1 (2026-09-27): this was the stock light textarea
        // (bg-white, dark: variants). The Suite never sets the dark class,
        // so every textarea without its own background was white with the
        // page's light text inherited: typed text all but invisible. It now
        // matches Input.
        "flex min-h-[80px] w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 ring-offset-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        ds && FIELD_THEMED,
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }