// Context menu pieces for workstation apps that follow the design
// system theme. @/components/ui/context-menu is not one of the adapted
// primitives yet (it hard-codes the dark console), so inside an opted-in
// <ThemedApp> this wrapper passes theme role classes (tailwind-merge lets
// them win) and puts the scope attribute on the portal content. Outside a
// scope it renders the ui pieces exactly as they are.
// Remove once the design-system lead adapts ui/context-menu.
import React from 'react';
import {
  ContextMenu, ContextMenuTrigger,
  ContextMenuContent as UiContent,
  ContextMenuItem as UiItem,
  ContextMenuLabel as UiLabel,
  ContextMenuSeparator as UiSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger as UiSubTrigger,
  ContextMenuSubContent as UiSubContent,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { useDsTheme, usePortalThemeProps } from '@/design/themeContext';

const MENU = 'border-pl-border bg-pl-raised text-pl-text shadow-pl-md';
const ITEM = 'focus:bg-pl-sunken focus:text-pl-text data-[state=open]:bg-pl-sunken';

const themed = (Ui, cls, portal = false) => {
  const Themed = React.forwardRef(({ className, ...props }, ref) => {
    const ds = useDsTheme();
    const portalProps = usePortalThemeProps();
    if (!ds) return <Ui ref={ref} className={className} {...props} />;
    return <Ui ref={ref} className={cn(cls, className)} {...(portal ? portalProps : {})} {...props} />;
  });
  Themed.displayName = `Themed${Ui.displayName || 'ContextMenuPart'}`;
  return Themed;
};

export const ContextMenuContent = themed(UiContent, MENU, true);
export const ContextMenuSubContent = themed(UiSubContent, MENU, true);
export const ContextMenuItem = themed(UiItem, ITEM);
export const ContextMenuSubTrigger = themed(UiSubTrigger, ITEM);
export const ContextMenuLabel = themed(UiLabel, 'text-pl-text');
export const ContextMenuSeparator = themed(UiSeparator, 'bg-pl-border');
export { ContextMenu, ContextMenuTrigger, ContextMenuSub };
