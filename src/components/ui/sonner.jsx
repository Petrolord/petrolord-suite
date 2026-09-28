import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"
import { useActiveTheme } from "@/design/activeTheme"

// Toasts match the page (owner revision of lead decision 3, 2026-09-28).
// While an opted-in app (<ThemedApp>) is on screen the toaster takes its
// theme: the wrapper carries data-pl-theme so the pl-* roles resolve, and
// sonner's own light or dark palette (richColors) follows. On every other
// page nothing changes: no wrapper, the legacy classes byte for byte.
const LEGACY_CLASSES = {
  toast:
    "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
  description: "group-[.toast]:text-muted-foreground",
  actionButton:
    "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
  cancelButton:
    "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
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
  const { theme = "system" } = useTheme()
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
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: LEGACY_CLASSES,
      }}
      {...props} />
  );
}

export { Toaster }
