import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Design system roles. The status variants (success, warning, danger, info) are the one place
// colour carries meaning; use them for status, never for decoration.
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-pl-focus focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-pl-primary text-pl-primary-fg",
        secondary: "border-transparent bg-pl-sunken text-pl-text",
        destructive: "border-transparent bg-pl-danger text-pl-danger-fg",
        outline: "border-pl-border-strong text-pl-text",
        accent: "border-transparent bg-pl-accent text-pl-accent-fg",
        success: "border-transparent bg-pl-success-bg text-pl-success-text",
        warning: "border-transparent bg-pl-warning-bg text-pl-warning-text",
        danger: "border-transparent bg-pl-danger-bg text-pl-danger-text",
        info: "border-transparent bg-pl-info-bg text-pl-info-text",
        // not a status: counts, tags, "draft", an item's kind
        neutral: "border-pl-border bg-pl-sunken text-pl-muted",
        // the chosen chip in a set of filter or choice chips
        selected: "border-pl-primary bg-pl-primary/10 text-pl-primary-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }