import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import React from 'react';

// Button on the design-system roles (docs/scope/DesignSystem.md). `accent`
// is the brand gold. `sm` is h-8 with text-xs, the height of a text-xs
// Input or SelectTrigger (h-8), so a toolbar button sits flush beside one.
// `xs` is h-[26px], the height of a CompactInput or compact NativeSelect
// (text-xs, py-1, 1px border), for a button in a dense editor row.
const buttonVariants = cva(
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
				sm: 'h-8 rounded-md px-3 text-xs',
				xs: 'h-[26px] rounded px-2 text-xs',
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
	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			ref={ref}
			{...props}
		/>
	);
});
Button.displayName = 'Button';

export { Button, buttonVariants };
