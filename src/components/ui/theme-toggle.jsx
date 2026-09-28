import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';

/**
 * Light / dark switch for an app header. Renders nothing outside a
 * <ThemedApp> scope and inside a fixed scope (the dark ink rail).
 * The choice is remembered per user by the ThemeProvider.
 */
const ThemeToggle = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme();
  if (!ds || ds.fixed) return null;
  const isDark = ds.theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      ref={ref}
      type="button"
      onClick={ds.toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      data-testid="theme-toggle"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-pl-border bg-pl-surface text-pl-muted transition-colors hover:bg-pl-sunken hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus focus-visible:ring-offset-2 ring-offset-pl-bg',
        className
      )}
      {...props}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
});
ThemeToggle.displayName = 'ThemeToggle';

export { ThemeToggle };
