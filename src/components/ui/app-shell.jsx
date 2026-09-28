import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/theme-toggle';

// Design system shell pieces. They use theme roles only, so they belong
// inside a theme scope (every /dashboard page sits in the dashboard scope).

/**
 * App header bar: back link, title (with optional eyebrow and subtitle),
 * a slot for tabs or controls, actions on the right and the theme toggle.
 */
const AppHeader = ({
  title,
  eyebrow,
  subtitle,
  backTo,
  backLabel = 'Back',
  icon: Icon,
  actions,
  showThemeToggle = true,
  className,
  children,
}) => {
  const navigate = useNavigate();
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-pl-border bg-pl-surface/95 backdrop-blur supports-[backdrop-filter]:bg-pl-surface/85',
        className
      )}
    >
      {/* On phones the row wraps: when the actions do not fit beside a 10rem
          title they drop to the next line and wrap among themselves, and a
          children slot (tabs) takes its own full-width line, so nothing
          scrolls the page sideways at 390px. */}
      <div className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:flex-nowrap sm:px-6">
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
            title={backLabel}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-pl-muted transition-colors hover:bg-pl-sunken hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {Icon && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-pl-primary text-pl-primary-fg">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-[10rem] flex-1 sm:min-w-0 sm:flex-initial">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pl-accent-text">{eyebrow}</p>
          )}
          <h1 className="truncate text-lg font-semibold leading-tight text-pl-text">{title}</h1>
          {subtitle && <p className="truncate text-xs text-pl-muted">{subtitle}</p>}
        </div>
        {children && (
          <div className="order-last flex w-full min-w-0 items-center overflow-x-auto sm:order-none sm:ml-2 sm:w-auto sm:flex-1">
            {children}
          </div>
        )}
        <div
          data-slot="app-header-actions"
          className={cn(
            'ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 sm:shrink-0 sm:flex-nowrap',
            children && 'sm:ml-0'
          )}
        >
          {actions}
          {showThemeToggle && <ThemeToggle />}
        </div>
      </div>
    </header>
  );
};

/** Page body: centred, padded, readable width unless `wide`. */
const PageContainer = React.forwardRef(({ className, wide = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('mx-auto w-full px-4 py-6 sm:px-6', wide ? 'max-w-none' : 'max-w-[1400px]', className)}
    {...props}
  />
));
PageContainer.displayName = 'PageContainer';

/** A titled section of a page. */
const PageSection = React.forwardRef(({ title, description, actions, className, children, ...props }, ref) => (
  <section ref={ref} className={cn('space-y-4', className)} {...props}>
    {(title || actions) && (
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {title && <h2 className="text-base font-semibold text-pl-text">{title}</h2>}
          {description && <p className="mt-0.5 text-sm text-pl-muted">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
));
PageSection.displayName = 'PageSection';

/** Display heading in the brand serif, for page titles and hero numbers only. */
const DisplayHeading = React.forwardRef(({ as: Comp = 'h1', className, ...props }, ref) => (
  <Comp ref={ref} className={cn('font-pl-display text-3xl font-semibold leading-tight text-pl-text', className)} {...props} />
));
DisplayHeading.displayName = 'DisplayHeading';

export { AppHeader, PageContainer, PageSection, DisplayHeading };
