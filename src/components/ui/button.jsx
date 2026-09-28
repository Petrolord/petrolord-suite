import { cn } from '@/lib/utils';
    import { Slot } from '@radix-ui/react-slot';
    import { cva } from 'class-variance-authority';
    import React from 'react';
    import { useDsTheme } from '@/design/themeContext';

    const buttonVariants = cva(
    	'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    	{
    		variants: {
    			variant: {
    				default: 'bg-blue-600 text-white hover:bg-blue-600/90',
    				destructive:
              'bg-red-600 text-slate-50 hover:bg-red-600/90',
    				outline:
              'border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white',
    				secondary:
              'bg-slate-700 text-slate-200 hover:bg-slate-600/80',
    				ghost: 'hover:bg-slate-800 hover:text-slate-200',
    				link: 'text-slate-200 underline-offset-4 hover:underline',
    			},
    			size: {
    				default: 'h-10 px-4 py-2',
    				sm: 'h-9 rounded-md px-3',
    				lg: 'h-11 rounded-md px-8',
    				icon: 'h-10 w-10',
    			},
    		},
    		defaultVariants: {
    			variant: 'default',
    			size: 'default',
    		},
    	},
    );

    // Design system: the same variant names on theme roles, used only inside
    // an opted-in <ThemedApp> scope. `accent` (brand gold) exists only here.
    const themedButtonVariants = cva(
    	'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-pl-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    	{
    		variants: {
    			variant: {
    				default: 'bg-pl-primary text-pl-primary-fg hover:bg-pl-primary-hover',
    				destructive: 'bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90',
    				outline: 'border border-pl-border-strong bg-pl-surface text-pl-text hover:bg-pl-sunken',
    				secondary: 'border border-pl-border bg-pl-sunken text-pl-text hover:bg-pl-border',
    				ghost: 'text-pl-muted hover:bg-pl-sunken hover:text-pl-text',
    				link: 'text-pl-primary-text underline-offset-4 hover:text-pl-primary-text-hover hover:underline',
    				accent: 'bg-pl-accent text-pl-accent-fg hover:bg-pl-accent/90',
    			},
    			size: {
    				default: 'h-10 px-4 py-2',
    				sm: 'h-9 rounded-md px-3',
    				lg: 'h-11 rounded-md px-8',
    				icon: 'h-10 w-10',
    			},
    		},
    		defaultVariants: {
    			variant: 'default',
    			size: 'default',
    		},
    	},
    );

    const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
    	const Comp = asChild ? Slot : 'button';
    	const ds = useDsTheme();
    	const variants = ds ? themedButtonVariants : buttonVariants;
    	return (
    		<Comp
    			className={cn(variants({ variant, size, className }))}
    			ref={ref}
    			{...props}
    		/>
    	);
    });
    Button.displayName = 'Button';

    export { Button, buttonVariants, themedButtonVariants };