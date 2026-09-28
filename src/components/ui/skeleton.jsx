import React from "react"
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  // Design system: a hairline tint inside an opted-in scope.
  return (
    <div
      className={cn("animate-pulse rounded-md bg-pl-border/70", className)}
      {...props}
    />
  )
}

export { Skeleton }
