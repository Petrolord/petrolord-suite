import React from 'react';
import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';

// Native <select> and dense-table field styles. A native select keeps the
// platform picker (good on phones and for long unit lists); these classes
// match it to the themed Input. The compact size (text-xs, 4px by 8px padding)
// is for editor tables where a 40px field would double the row height.
//
// Inside an opted-in scope the theme roles apply; outside one the legacy
// dark console look that the ui Input uses.

/** Themed classes, for a plain <select> or <input> an app writes itself. */
export const NATIVE_SELECT_THEMED =
  'h-10 w-full rounded-md border border-pl-border-strong bg-pl-surface px-3 text-sm text-pl-text '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:cursor-not-allowed disabled:opacity-50';

export const COMPACT_FIELD_THEMED =
  'w-full rounded border border-pl-border-strong bg-pl-surface px-2 py-1 text-xs text-pl-text '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:cursor-not-allowed disabled:opacity-50';

const NATIVE_SELECT_LEGACY =
  'h-10 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-sm text-slate-50 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50';

const COMPACT_FIELD_LEGACY =
  'w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-50 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50';

/** The class string for the current scope: nativeFieldClass(ds, 'select' | 'compact'). */
export function nativeFieldClass(ds, kind = 'select') {
  if (kind === 'compact') return ds ? COMPACT_FIELD_THEMED : COMPACT_FIELD_LEGACY;
  return ds ? NATIVE_SELECT_THEMED : NATIVE_SELECT_LEGACY;
}

/** <NativeSelect value onChange compact>...<option/>...</NativeSelect> */
const NativeSelect = React.forwardRef(({ className, compact = false, ...props }, ref) => {
  const ds = useDsTheme();
  return <select ref={ref} className={cn(nativeFieldClass(ds, compact ? 'compact' : 'select'), className)} {...props} />;
});
NativeSelect.displayName = 'NativeSelect';

/** A compact <input> for dense tables (numbers right aligned by the caller). */
const CompactInput = React.forwardRef(({ className, type = 'text', ...props }, ref) => {
  const ds = useDsTheme();
  return <input ref={ref} type={type} className={cn(nativeFieldClass(ds, 'compact'), className)} {...props} />;
});
CompactInput.displayName = 'CompactInput';

export { NativeSelect, CompactInput };
