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
      className={cn("animate-pulse rounded-md bg-pl-border/70", className)}
      {...props}
    />
  )
}

export { Skeleton }
