// "Open in ..." launchers for registry wells (Geoscience cross-app
// navigation, 2026-09-03): the same app table (appLinks.js) rendered as a
// dropdown button (ribbon, well detail header) or as a context-menu
// submenu (wells tree rows). Items are real links, so middle-click and
// copy-link work and the harness can assert hrefs.

import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuItem } from '@/components/workstation/themedContextMenu';
import { WELL_APPS, buildOpenInHref } from './appLinks';
import { useThemeClass } from '@/lib/themeClass';

// Design system: themed class strings for tc() (see src/lib/themeClass.js).
// Outside an opted-in scope tc() returns the legacy string unchanged.
const THEMED_CLASSES = {
  "flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700\n            text-slate-300 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 ":
    "flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border\n            text-pl-text hover:text-pl-text hover:bg-pl-sunken disabled:opacity-40 ",
  "text-[10px] uppercase tracking-wider text-slate-500":
    "text-[10px] uppercase tracking-wider text-pl-muted",
};

const itemsFor = (wellIds, paths, exclude) => WELL_APPS
  .filter((app) => !exclude?.includes(app.id))
  .map((app) => ({ app, href: buildOpenInHref(app, wellIds, paths) }));

/**
 * Dropdown launcher.
 * @param {Object} p
 * @param {string[]} p.wellIds wells to open (the first is used where an app takes one)
 * @param {Object} [p.paths] route overrides (harness)
 * @param {string[]} [p.exclude] app ids to leave out
 * @param {string} p.testIdPrefix e.g. 'wdm' -> `wdm-open-in`, `wdm-open-in-<app>`
 */
export function OpenInAppMenu({ wellIds, paths, exclude, testIdPrefix, disabled = false, className = '', label = 'Open in' }) {
  const tc = useThemeClass(THEMED_CLASSES);
  const items = itemsFor(wellIds, paths, exclude);
  const none = disabled || !(wellIds || []).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`${testIdPrefix}-open-in`}
          disabled={none}
          title={none ? 'Select a well first' : 'Open this well in another Geoscience app'}
          className={`${tc("flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700\n            text-slate-300 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40 ")}${className}`}
        >
          <ExternalLink className="w-3.5 h-3.5" /> {label} <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className={tc("text-[10px] uppercase tracking-wider text-slate-500")}>Geoscience apps</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ app, href }) => (
          <DropdownMenuItem key={app.id} asChild>
            <Link to={href} data-testid={`${testIdPrefix}-open-in-${app.id}`} className="cursor-pointer">
              {app.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Context-menu submenu with the same items (mount inside a ContextMenuContent). */
export function OpenInAppSubmenu({ wellIds, paths, exclude, testIdPrefix }) {
  const items = itemsFor(wellIds, paths, exclude);
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger data-testid={`${testIdPrefix}-open-in`}>
        <ExternalLink className="w-4 h-4 mr-2" /> Open in
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        {items.map(({ app, href }) => (
          <ContextMenuItem key={app.id} asChild>
            <Link to={href} data-testid={`${testIdPrefix}-open-in-${app.id}`} className="cursor-pointer">
              {app.label}
            </Link>
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

export default OpenInAppMenu;
