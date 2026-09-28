import React from 'react';
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants, themedButtonVariants } from "@/components/ui/button";
import { useDsTheme, usePortalThemeProps } from "@/design/themeContext";

// Design system: merged over the legacy classes only inside an opted-in
// scope. Overlay and content render in a portal, so both carry
// data-pl-theme themselves; the action buttons take the themed variants.
const THEMED = {
  overlay: "bg-black/50",
  content: "border-pl-border bg-pl-raised text-pl-text shadow-pl-lg",
  title: "text-pl-text",
  description: "text-pl-muted",
};

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = ({ className, ...props }) => (
  <AlertDialogPrimitive.Portal className={cn(className)} {...props} />
);
AlertDialogPortal.displayName = AlertDialogPrimitive.Portal.displayName;

const AlertDialogOverlay = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  const portalProps = usePortalThemeProps();
  return (
    <AlertDialogPrimitive.Overlay
      {...portalProps}
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        THEMED.overlay,
        className
      )}
      {...props}
      ref={ref}
    />
  );
});
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  const portalProps = usePortalThemeProps();
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        {...portalProps}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-700 bg-slate-900 p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg text-slate-100",
          THEMED.content,
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
    <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-white", THEMED.title, className)} {...props} />
  );
});
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-slate-400", THEMED.description, className)}
      {...props}
    />
  );
});
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  const variants = themedButtonVariants;
  return <AlertDialogPrimitive.Action ref={ref} className={cn(variants(), className)} {...props} />;
});
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  const variants = themedButtonVariants;
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(variants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
      {...props}
    />
  );
});
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
