import React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDsTheme } from "@/design/themeContext"

// Design system: theme roles merged over the legacy classes only inside an
// opted-in scope. The content panel carries no colour, so it needs none.
const THEMED = {
  item: "border-pl-border",
  trigger: "text-pl-text rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus",
}

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    <AccordionPrimitive.Item ref={ref} className={cn("border-b border-slate-700", ds && THEMED.item, className)} {...props} />
  )
})
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline text-white [&[data-state=open]>svg]:rotate-180",
          ds && THEMED.trigger,
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className={ds ? "h-4 w-4 shrink-0 text-pl-muted transition-transform duration-200" : "h-4 w-4 shrink-0 transition-transform duration-200"} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
})
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
