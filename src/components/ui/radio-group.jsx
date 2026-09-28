import React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useThemeClass } from '@/design/themeClass';

const RadioGroup = React.forwardRef(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />;
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

// Design system: theme roles inside an opted-in scope (primary ring and dot
// when chosen); outside one the legacy string, byte for byte (pinned in
// uiLegacyDom.test.jsx).
const RadioGroupItem = React.forwardRef(({ className, ...props }, ref) => {
  const tc = useThemeClass();
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        tc(
          'aspect-square h-4 w-4 rounded-full border border-slate-400 text-slate-50 ring-offset-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          'aspect-square h-4 w-4 rounded-full border border-pl-border-strong bg-pl-surface text-pl-primary ring-offset-pl-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-pl-primary',
        ),
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };