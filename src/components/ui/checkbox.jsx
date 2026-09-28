import React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';

// Design system: merged over the legacy classes only inside an opted-in
// scope. A 4px corner keeps the box square where --radius grows to 12px.
const THEMED =
  'rounded-[4px] border-pl-border-strong bg-pl-surface ring-offset-pl-bg focus-visible:ring-pl-focus '
  + 'data-[state=checked]:border-pl-primary data-[state=checked]:bg-pl-primary data-[state=checked]:text-pl-primary-fg';

const Checkbox = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-slate-500 ring-offset-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-cyan-600 data-[state=checked]:text-white data-[state=checked]:border-cyan-600',
        THEMED,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
