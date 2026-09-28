import React from 'react';
import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';

// A titled white card for a chart. It carries data-canvas="chart", which
// inside an opted-in scope pins the light roles, so the title, the border
// and anything inside read as on a white page in both themes, and the chart
// keeps the white chartTheme + ChartLogo standard. Put a ChartFrame (or any
// chart that follows the standard) in it.
//
//   <ChartPanel title="Rate vs time" subtitle="Oil, stb/d" actions={<Button size="sm">PNG</Button>}>
//     <ChartFrame height={280}>...</ChartFrame>
//   </ChartPanel>
//
// Outside a scope it renders a plain white card with slate text.
const LOOK = {
  themed: {
    card: 'rounded-xl border border-pl-border bg-pl-chart-surface p-4 text-pl-text shadow-pl-sm',
    title: 'text-sm font-semibold text-pl-text',
    subtitle: 'text-xs text-pl-muted',
  },
  legacy: {
    card: 'rounded-lg border border-slate-200 bg-white p-4 text-slate-800 shadow-sm',
    title: 'text-sm font-semibold text-slate-800',
    subtitle: 'text-xs text-slate-500',
  },
};

const ChartPanel = React.forwardRef(({
  title, subtitle, actions, as: Comp = 'section', className, bodyClassName, children, ...props
}, ref) => {
  const ds = useDsTheme();
  const look = ds ? LOOK.themed : LOOK.legacy;
  const hasHead = title || subtitle || actions;
  return (
    <Comp ref={ref} data-canvas="chart" className={cn(look.card, className)} {...props}>
      {hasHead && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h3 className={look.title}>{title}</h3>}
            {subtitle && <p className={look.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
    </Comp>
  );
});
ChartPanel.displayName = 'ChartPanel';

export { ChartPanel };
