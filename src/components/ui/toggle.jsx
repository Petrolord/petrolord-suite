import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useDsTheme } from "@/design/themeContext"

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Design system: the same variants on theme roles, used only inside an
// opted-in scope. "On" is the primary fill so the chosen state reads at a
// glance (Radix sets aria-pressed on a Toggle).
const themedToggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium text-pl-text ring-offset-pl-bg transition-colors hover:bg-pl-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-pl-primary data-[state=on]:text-pl-primary-fg",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-pl-border-strong bg-pl-surface",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Toggle = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  const ds = useDsTheme()
  const variants = ds ? themedToggleVariants : toggleVariants
  return (
    <TogglePrimitive.Root
      ref={ref}
      className={cn(variants({ variant, size, className }))}
      {...props}
    />
  )
})

Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants, themedToggleVariants }
