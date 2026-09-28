import React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';

// Design system: full themed strings used only inside an opted-in scope;
// outside one the legacy classes render byte for byte. `thumbClassName`
// styles the thumb (both looks).
const THEMED_ROOT =
  'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 focus-visible:ring-offset-pl-bg '
  + 'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-pl-primary data-[state=unchecked]:bg-pl-border-strong';
const THEMED_THUMB =
  'pointer-events-none block h-5 w-5 rounded-full bg-pl-surface shadow-pl-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0';

const Switch = React.forwardRef(({ className, thumbClassName, ...props }, ref) => {
  const ds = useDsTheme();
  return (
    <SwitchPrimitives.Root
      className={cn(
        ds
          ? THEMED_ROOT
          : 'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-lime-500 data-[state=unchecked]:bg-slate-600 dark:focus-visible:ring-slate-300 dark:focus-visible:ring-offset-slate-950 dark:data-[state=checked]:bg-lime-500 dark:data-[state=unchecked]:bg-slate-600',
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          ds
            ? THEMED_THUMB
            : 'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 dark:bg-slate-950',
          thumbClassName
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
