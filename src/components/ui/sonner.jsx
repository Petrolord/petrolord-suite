import { Toaster as Sonner } from "sonner"
import { useActiveTheme } from "@/design/activeTheme"

// Toasts match the page (owner revision of lead decision 3, 2026-09-28).
// While a theme scope (<ThemedApp>) is on screen the toaster takes its
// theme: the wrapper carries data-pl-theme so the pl-* roles resolve, and
// sonner's own light or dark palette (richColors) follows. Where no scope is
// mounted (the homepage) the toasts take one light style in the homepage's
// paper palette (Home.css: white card, ink text, hairline border), with no
// rich status colours.
const PAPER_CLASSES = {
  toast:
    "group toast group-[.toaster]:bg-[#FFFFFF] group-[.toaster]:text-[#14231B] group-[.toaster]:border-[#D5DCD2] group-[.toaster]:shadow-lg group-[.toaster]:font-[Public_Sans,system-ui,sans-serif]",
  description: "group-[.toast]:text-[#56655C]",
  actionButton:
    "group-[.toast]:bg-[#0C1F16] group-[.toast]:text-[#EEF2EC]",
  cancelButton:
    "group-[.toast]:bg-[#E7EBE3] group-[.toast]:text-[#14231B]",
  closeButton:
    "group-[.toast]:border-[#D5DCD2] group-[.toast]:bg-[#FFFFFF] group-[.toast]:text-[#56655C]",
}

const THEMED_CLASSES = {
  toast:
    "group toast group-[.toaster]:bg-pl-raised group-[.toaster]:text-pl-text group-[.toaster]:border-pl-border group-[.toaster]:shadow-pl-md group-[.toaster]:font-pl-sans",
  description: "group-[.toast]:text-pl-muted",
  actionButton:
    "group-[.toast]:bg-pl-primary group-[.toast]:text-pl-primary-fg",
  cancelButton:
    "group-[.toast]:bg-pl-sunken group-[.toast]:text-pl-text",
  closeButton:
    "group-[.toast]:border-pl-border group-[.toast]:bg-pl-raised group-[.toast]:text-pl-muted",
}

const Toaster = ({
  ...props
}) => {
  const active = useActiveTheme()

  if (active) {
    return (
      <div data-pl-theme={active} data-pl-toaster="" className="contents">
        <Sonner
          theme={active}
          className="toaster group"
          toastOptions={{ classNames: THEMED_CLASSES }}
          {...props} />
      </div>
    )
  }

  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{ classNames: PAPER_CLASSES }}
      {...props}
      richColors={false} />
  );
}

export { Toaster }
