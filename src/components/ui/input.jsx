import React from 'react';
import { cn } from '@/lib/utils';

// Design system: FIELD_THEMED is merged over the legacy classes only inside
// an opted-in scope (tailwind-merge replaces the colour classes).
export const FIELD_THEMED = 'border-pl-border-strong bg-pl-surface text-pl-text ring-offset-pl-bg placeholder:text-pl-muted focus-visible:ring-pl-focus';

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 ring-offset-slate-900 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        FIELD_THEMED,
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };