// Shared page chrome for the module hubs and the dashboard landing
// (design-system pilot 1). Theme roles only, so it belongs inside the
// HubScope; every hub renders it there.
import React, { useId } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DisplayHeading, PageContainer } from '@/components/ui/app-shell';

/** Page body for a hub: centred, padded, sections spaced. */
export function HubPage({ className, children }) {
  return <PageContainer className={cn('space-y-8 pb-12', className)}>{children}</PageContainer>;
}

/**
 * Hub header: gold eyebrow, serif title, description, actions and the
 * light/dark toggle. Wraps under the title at phone width.
 */
export function HubHeader({ eyebrow = 'Module hub', title, description, actions, className }) {
  return (
    <header className={cn('flex flex-col gap-4 md:flex-row md:items-start md:justify-between', className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pl-accent-text">{eyebrow}</p>
        ) : null}
        <DisplayHeading className="mt-1 text-3xl sm:text-4xl">{title}</DisplayHeading>
        {description ? <p className="mt-2 text-sm leading-relaxed text-pl-muted sm:text-base">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Section heading inside a hub page. */
export function HubSectionTitle({ children, className }) {
  return <h2 className={cn('text-lg font-semibold text-pl-text', className)}>{children}</h2>;
}

/** The application search box every hub carries. */
export function HubSearch({ value, onChange, placeholder = 'Search applications...', className }) {
  const id = useId();
  return (
    <div className={cn('relative w-full md:w-96', className)}>
      <label htmlFor={id} className="sr-only">Search applications</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pl-muted" aria-hidden="true" />
      <Input
        id={id}
        type="search"
        placeholder={placeholder}
        className="pl-10"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

/** The search bar panel above a hub's catalogue grid. */
export function HubToolbar({ children, className }) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-xl border border-pl-border bg-pl-surface p-4 shadow-pl-sm md:flex-row md:items-center md:justify-between', className)}>
      {children}
    </div>
  );
}
