import React from "react"
import { cn } from "@/lib/utils"
import { useDsTheme } from "@/design/themeContext"

function Skeleton({
  className,
  ...props
}) {
  // Design system: a hairline tint inside an opted-in scope.
  const ds = useDsTheme()
  return (
    <div
      className={cn(ds ? "animate-pulse rounded-md bg-pl-border/70" : "animate-pulse rounded-md bg-slate-100 dark:bg-slate-800", className)}
      {...props}
    />
  )
}

export { Skeleton }
