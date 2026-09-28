import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"
import { useDsTheme } from "@/design/themeContext"

// Design system: a hairline track and a solid primary bar inside an opted-in
// scope (no gradient); the legacy lime bar outside one, byte for byte.
const Progress = React.forwardRef(({ className, value, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", ds && "bg-pl-border", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={ds ? "h-full w-full flex-1 bg-pl-primary transition-all" : "h-full w-full flex-1 bg-primary transition-all bg-gradient-to-r from-lime-400 to-green-500"}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
