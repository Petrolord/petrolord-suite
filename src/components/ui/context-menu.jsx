import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"
import { usePortalThemeProps } from "@/design/themeContext";

// Design system: merged over the legacy classes only inside an opted-in
// scope (tailwind-merge swaps the colours), the same roles as the dropdown
// menu. Menu surfaces carry data-pl-theme themselves because the content
// renders in a portal outside the scope element.
const THEMED = {
  content: "border-pl-border bg-pl-raised text-pl-text shadow-pl-md",
  item: "focus:bg-pl-sunken focus:text-pl-text data-[state=open]:bg-pl-sunken",
  label: "text-pl-text",
  separator: "bg-pl-border",
  shortcut: "text-pl-muted",
}

const ContextMenu = ContextMenuPrimitive.Root

const ContextMenuTrigger = ContextMenuPrimitive.Trigger

const ContextMenuGroup = ContextMenuPrimitive.Group

const ContextMenuPortal = ContextMenuPrimitive.Portal

const ContextMenuSub = ContextMenuPrimitive.Sub

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup

const ContextMenuSubTrigger = React.forwardRef(({ className, inset, children, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-slate-700 data-[state=open]:bg-slate-700",
        inset && "pl-8",
        THEMED.item,
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </ContextMenuPrimitive.SubTrigger>
  )
})
ContextMenuSubTrigger.displayName =
  ContextMenuPrimitive.SubTrigger.displayName

const ContextMenuSubContent = React.forwardRef(({ className, ...props }, ref) => {
  const portalProps = usePortalThemeProps()
  return (
    <ContextMenuPrimitive.SubContent
      ref={ref}
      {...portalProps}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-100 shadow-md animate-in fade-in-80",
        THEMED.content,
        className
      )}
      {...props}
    />
  )
})
ContextMenuSubContent.displayName =
  ContextMenuPrimitive.SubContent.displayName

const ContextMenuContent = React.forwardRef(({ className, ...props }, ref) => {
  const portalProps = usePortalThemeProps()
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={ref}
        {...portalProps}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-100 shadow-md animate-in fade-in-80",
          THEMED.content,
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
})
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

const ContextMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-slate-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        THEMED.item,
        className
      )}
      {...props}
    />
  )
})
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName

const ContextMenuCheckboxItem = React.forwardRef(({ className, children, checked, ...props }, ref) => {
  return (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-slate-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      THEMED.item,
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
  )
})
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName

const ContextMenuRadioItem = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-slate-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      THEMED.item,
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
  )
})
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName

const ContextMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-sm font-semibold text-slate-100",
        inset && "pl-8",
        THEMED.label,
        className
      )}
      {...props}
    />
  )
})
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName

const ContextMenuSeparator = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-slate-700", THEMED.separator, className)}
      {...props}
    />
  )
})
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName

const ContextMenuShortcut = ({
  className,
  ...props
}) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-slate-400", THEMED.shortcut, className)}
      {...props}
    />
  )
}
ContextMenuShortcut.displayName = "ContextMenuShortcut"

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}