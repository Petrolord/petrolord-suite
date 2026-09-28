import * as React from "react"
    import * as DialogPrimitive from "@radix-ui/react-dialog"
    import { X } from "lucide-react"

    import { cn } from "@/lib/utils"
    import { useDsTheme, usePortalThemeProps } from "@/design/themeContext"

// Design system: overlay classes merged over the legacy ones only inside an
// opted-in <ThemedApp> scope (tailwind-merge swaps the colours). Portal
// content carries data-pl-theme itself because it renders outside the scope.
const THEMED = {
  overlay: "bg-black/50",
  content: "border-pl-border bg-pl-raised text-pl-text shadow-pl-lg",
  title: "text-pl-text",
  description: "text-pl-muted",
};

    const Dialog = DialogPrimitive.Root

    const DialogTrigger = DialogPrimitive.Trigger

    const DialogPortal = DialogPrimitive.Portal

    const DialogClose = DialogPrimitive.Close

    const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  const portalProps = usePortalThemeProps();
  return (
      <DialogPrimitive.Overlay
        ref={ref}
      {...portalProps}
        className={cn(
          "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          THEMED.overlay, className
        )}
        {...props} />
    );
})
    DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

    const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const ds = useDsTheme();
  const portalProps = usePortalThemeProps();
  return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
      {...portalProps}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-700 bg-slate-900 p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
            THEMED.content, className
          )}
          {...props}>
          {children}
          <DialogPrimitive.Close
            className={"absolute right-4 top-4 rounded-sm opacity-70 ring-offset-pl-bg transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-pl-focus focus:ring-offset-2 disabled:pointer-events-none"}>
            <X className={"h-4 w-4 text-pl-muted"} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
})
    DialogContent.displayName = DialogPrimitive.Content.displayName

    const DialogHeader = ({
      className,
      ...props
    }) => (
      <div
        className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
        {...props} />
    )
    DialogHeader.displayName = "DialogHeader"

    const DialogFooter = ({
      className,
      ...props
    }) => (
      <div
        className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
        {...props} />
    )
    DialogFooter.displayName = "DialogFooter"

    const DialogTitle = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
      <DialogPrimitive.Title
        ref={ref}
        className={cn("text-lg font-semibold leading-none tracking-tight text-white", THEMED.title, className)}
        {...props} />
    );
})
    DialogTitle.displayName = DialogPrimitive.Title.displayName

    const DialogDescription = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
      <DialogPrimitive.Description
        ref={ref}
        className={cn("text-sm text-slate-400", THEMED.description, className)}
        {...props} />
    );
})
    DialogDescription.displayName = DialogPrimitive.Description.displayName

    export {
      Dialog,
      DialogPortal,
      DialogOverlay,
      DialogClose,
      DialogTrigger,
      DialogContent,
      DialogHeader,
      DialogFooter,
      DialogTitle,
      DialogDescription,
    }