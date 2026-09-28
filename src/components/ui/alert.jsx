import React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Design system roles.
// The status variants carry meaning; pair them with a title or icon.
const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
  {
    variants: {
      variant: {
        default: "border-pl-border bg-pl-surface text-pl-text [&>svg]:text-pl-muted",
        destructive: "border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text [&>svg]:text-pl-danger-text",
        danger: "border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text [&>svg]:text-pl-danger-text",
        warning: "border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text [&>svg]:text-pl-warning-text",
        success: "border-pl-success/40 bg-pl-success-bg text-pl-success-text [&>svg]:text-pl-success-text",
        info: "border-pl-info/40 bg-pl-info-bg text-pl-info-text [&>svg]:text-pl-info-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
})
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription, alertVariants }
