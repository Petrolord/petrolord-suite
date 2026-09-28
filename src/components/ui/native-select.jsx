import React from 'react';
import { cn } from '@/lib/utils';

// Native <select> and dense-table field styles. A native select keeps the
// platform picker (good on phones and for long unit lists); these classes
// match it to the themed Input. The compact size (text-xs, 4px by 8px padding)
// is for editor tables where a 40px field would double the row height.

/** Themed classes, for a plain <select> or <input> an app writes itself. */
export const NATIVE_SELECT_THEMED =
  'h-10 w-full rounded-md border border-pl-border-strong bg-pl-surface px-3 text-sm text-pl-text '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:cursor-not-allowed disabled:opacity-50';

export const COMPACT_FIELD_THEMED =
  'w-full rounded border border-pl-border-strong bg-pl-surface px-2 py-1 text-xs text-pl-text '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:cursor-not-allowed disabled:opacity-50';

/** <NativeSelect value onChange compact>...<option/>...</NativeSelect> */
const NativeSelect = React.forwardRef(({ className, compact = false, ...props }, ref) => {
  return <select ref={ref} className={cn(compact ? COMPACT_FIELD_THEMED : NATIVE_SELECT_THEMED, className)} {...props} />;
});
NativeSelect.displayName = 'NativeSelect';

/** A compact <input> for dense tables (numbers right aligned by the caller). */
const CompactInput = React.forwardRef(({ className, type = 'text', ...props }, ref) => {
  return <input ref={ref} type={type} className={cn(COMPACT_FIELD_THEMED, className)} {...props} />;
});
CompactInput.displayName = 'CompactInput';

export { NativeSelect, CompactInput };
