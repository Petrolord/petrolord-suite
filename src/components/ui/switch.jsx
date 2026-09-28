import React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

// Design system roles. `thumbClassName` styles the thumb.
const THEMED_ROOT =
  'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 focus-visible:ring-offset-pl-bg '
  + 'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-pl-primary data-[state=unchecked]:bg-pl-border-strong';
const THEMED_THUMB =
  'pointer-events-none block h-5 w-5 rounded-full bg-pl-surface shadow-pl-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0';

const Switch = React.forwardRef(({ className, thumbClassName, ...props }, ref) => {
  return (
    <SwitchPrimitives.Root
      className={cn(
        THEMED_ROOT,
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          THEMED_THUMB,
          thumbClassName
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
