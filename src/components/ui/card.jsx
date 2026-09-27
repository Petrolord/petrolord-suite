import React from "react";
import { cn } from "@/lib/utils";
import { useDsTheme } from "@/design/themeContext";

// Design system: inside an opted-in <ThemedApp> scope the card uses the
// theme roles; everywhere else the legacy dark classes render unchanged.
const LEGACY = {
  card: "rounded-lg border border-slate-700 bg-slate-800/30 text-slate-100 shadow-sm backdrop-blur-sm",
  description: "text-sm text-slate-400",
};
const THEMED = {
  card: "rounded-lg border border-pl-border bg-pl-surface text-pl-text shadow-pl-sm",
  description: "text-sm text-pl-muted",
};

const Card = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
    <div
      ref={ref}
      className={cn(ds ? THEMED.card : LEGACY.card, className)}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  return (
    <p
      ref={ref}
      className={cn(ds ? THEMED.description : LEGACY.description, className)}
      {...props}
    />
  );
});
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
