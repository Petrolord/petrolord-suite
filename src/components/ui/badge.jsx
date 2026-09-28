import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80",
        secondary:
          "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
        destructive:
          "border-transparent bg-red-500 text-slate-50 hover:bg-red-500/80 dark:bg-red-900 dark:text-slate-50 dark:hover:bg-red-900/80",
        outline: "text-slate-950 dark:text-slate-50",
        neutral: "border-slate-700 bg-slate-800 text-slate-300",
        selected: "border-transparent bg-slate-200 text-slate-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Design system: theme-role variants used only inside an opted-in scope.
// The status variants (success, warning, danger, info) are the one place
// colour carries meaning; use them for status, never for decoration.
const themedBadgeVariants = cva(
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
  const variants = themedBadgeVariants
  return (<div className={cn(variants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants, themedBadgeVariants }