import React from 'react';
import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';

// A row of mutually exclusive choices (fiscal regime, results view, units).
// Each option is a button with aria-pressed, inside a labelled group, so a
// screen reader hears "Monthly, toggle button, pressed". Arrow keys are not
// taken over: Tab moves between options like any buttons.
//
// Theme roles inside an opted-in scope; a slate look outside one, so a
// shared component may use it in either.
const LOOK = {
  themed: {
    group: 'inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-pl-border bg-pl-sunken p-1',
    item: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-pl-muted transition-colors hover:bg-pl-surface hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus disabled:pointer-events-none disabled:opacity-50',
    on: 'bg-pl-primary text-pl-primary-fg shadow-pl-sm hover:bg-pl-primary-hover hover:text-pl-primary-fg',
  },
  legacy: {
    group: 'inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1',
    item: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50',
    on: 'bg-slate-600 text-white shadow-sm hover:bg-slate-600',
  },
};

const SIZES = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' };

/**
 * <SegmentedControl
 *   label="Forecast view"            // accessible name of the group
 *   value={view} onValueChange={setView}
 *   options={[{ value: 'rate', label: 'Rate' }, { value: 'cum', label: 'Cumulative', icon: Sigma }]}
 * />
 */
const SegmentedControl = React.forwardRef(({
  options = [], value, onValueChange, label, size = 'md', className, itemClassName, ...props
}, ref) => {
  const ds = useDsTheme();
  const look = ds ? LOOK.themed : LOOK.legacy;
  return (
    <div ref={ref} role="group" aria-label={label} className={cn(look.group, className)} {...props}>
      {options.map((opt) => {
        const on = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={on}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => { if (!on && onValueChange) onValueChange(opt.value); }}
            className={cn(look.item, SIZES[size] || SIZES.md, on && look.on, itemClassName)}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
});
SegmentedControl.displayName = 'SegmentedControl';

export { SegmentedControl };
