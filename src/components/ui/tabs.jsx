import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const THEMED = {
  list: 'inline-flex h-10 items-center justify-center rounded-md border border-pl-border bg-pl-sunken p-1 text-pl-muted',
  trigger: 'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-pl-bg transition-all hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-pl-surface data-[state=active]:text-pl-text data-[state=active]:shadow-pl-sm',
  content: 'mt-2 ring-offset-pl-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2',
};

const TabsList = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(THEMED.list, className)}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(THEMED.trigger, className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(THEMED.content, className)}
      {...props}
    />
  );
});
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
