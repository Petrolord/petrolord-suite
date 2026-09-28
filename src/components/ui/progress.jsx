import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

// Design system: a hairline track and a solid primary bar inside an opted-in
// scope (no gradient); the legacy lime bar outside one, byte for byte.
const Progress = React.forwardRef(({ className, value, ...props }, ref) => {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", "bg-pl-border", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={"h-full w-full flex-1 bg-pl-primary transition-all"}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
