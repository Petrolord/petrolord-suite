import React from 'react';
    import * as LabelPrimitive from '@radix-ui/react-label';
    import { cva } from 'class-variance-authority';
    import { cn } from '@/lib/utils';
    import { useDsTheme } from '@/design/themeContext';

    const labelVariants = cva(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white mb-1 block"
    );

    // Design system: inside an opted-in scope the label takes the text role.
    const Label = React.forwardRef(({ className, ...props }, ref) => {
      const ds = useDsTheme();
      return (
        <LabelPrimitive.Root
          ref={ref}
          className={cn(labelVariants(), 'text-pl-text', className)}
          {...props}
        />
      );
    });

    Label.displayName = LabelPrimitive.Root.displayName;

    export { Label };