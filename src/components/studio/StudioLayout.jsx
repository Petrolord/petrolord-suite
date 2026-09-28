// Studio shell layout — the Reservoir-module workstation frame, generalized
// from the original DCA layout (retired in W5 when DCA adopted this kit) so every
// upgraded app shares one look: dark full-height frame, collapsible left/right
// ScrollArea rails, h-14 header bar. Fully props-driven; no app context.
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import StudioNotifications from './StudioNotifications';
import StudioLoadingOverlay from './StudioLoadingOverlay';
import { useDsTheme } from '@/design/themeContext';

// Design system: inside an opted-in <ThemedApp> scope the frame uses theme
// roles (and the rails overlay the page below lg so a phone keeps the main
// column); outside one every class string is exactly as before.
const THEMED = {
  root: 'flex h-screen w-full bg-pl-bg text-pl-text overflow-hidden',
  rail: 'flex-shrink-0 border-pl-border bg-pl-surface transition-all duration-300 ease-in-out flex flex-col z-20 max-lg:absolute max-lg:z-30 max-lg:max-w-[85vw] max-lg:shadow-pl-lg',
  header: 'min-h-14 sm:h-14 py-1 sm:py-0 flex-shrink-0 border-b border-pl-border bg-pl-surface flex items-center px-2 sm:px-4 justify-between gap-2 z-10',
  railToggle: 'h-8 w-8 sm:h-10 sm:w-10 text-pl-muted hover:text-pl-text shrink-0',
  main: 'flex-1 flex flex-col min-w-0 bg-pl-bg overflow-y-auto',
};

const StudioLayout = ({
  header,
  headerActions,
  sidebarLeft,
  sidebarRight,
  main,
  bottom,
  busyMessage = null,
  notifications = [],
  onDismissNotification,
  defaultLeftOpen = true,
  defaultRightOpen = true,
  leftWidthClass = 'w-80',
  rightWidthClass = 'w-96',
  className,
}) => {
  const [leftOpen, setLeftOpen] = useState(defaultLeftOpen);
  const [rightOpen, setRightOpen] = useState(defaultRightOpen);
  // no right rail passed (Fluid, SCAL, Material Balance): no empty 24rem
  // column and no toggle for it (Wave 2 T1: the empty rail squeezed the
  // results so KPI values ran out of their cards at 1366 px)
  const hasRight = sidebarRight !== null && sidebarRight !== undefined && sidebarRight !== false;
  const ds = useDsTheme();

  return (
    <div className={cn(ds ? THEMED.root : 'flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden', ds && 'relative', className)}>

      <StudioNotifications notifications={notifications} onDismiss={onDismissNotification} />

      {busyMessage && <StudioLoadingOverlay message={busyMessage} />}

      {/* Left Sidebar */}
      <div
        className={cn(
          ds ? cn(THEMED.rail, 'border-r max-lg:left-0 max-lg:top-14 max-lg:bottom-0') : 'flex-shrink-0 border-r border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20',
          leftOpen ? `${leftWidthClass} translate-x-0` : 'w-0 -translate-x-full opacity-0 border-none'
        )}
      >
        {/* a plain scroller: Radix ScrollArea wraps content in a display:table
            box that grows to its widest child, so long names pushed the rail's
            values and buttons out of view instead of truncating (Wave 2 T1) */}
        <div className="flex-1 h-full overflow-y-auto overflow-x-hidden">
          <div className="p-4 space-y-6 min-w-0">
            {sidebarLeft}
          </div>
        </div>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Header Bar */}
        <header className={ds ? THEMED.header : 'h-14 flex-shrink-0 border-b border-slate-800 bg-slate-900/80 flex items-center px-4 justify-between z-10'}>
          <div className={ds ? 'flex min-w-0 flex-1 items-center gap-2 sm:gap-3 overflow-hidden' : 'flex items-center gap-3 overflow-hidden'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftOpen(!leftOpen)}
              className={ds ? THEMED.railToggle : 'text-slate-400 hover:text-white shrink-0'}
              {...(ds ? { 'aria-label': leftOpen ? 'Hide the left panel' : 'Show the left panel', 'aria-expanded': leftOpen } : {})}
            >
              {leftOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </Button>
            <div className="flex-1 min-w-0">{header}</div>
          </div>
          <div className={ds ? 'flex items-center gap-1 sm:gap-2 shrink-0' : 'flex items-center gap-2 shrink-0'}>
            {headerActions}
            {hasRight && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightOpen(!rightOpen)}
                className={ds ? THEMED.railToggle : 'text-slate-400 hover:text-white'}
                {...(ds ? { 'aria-label': rightOpen ? 'Hide the right panel' : 'Show the right panel', 'aria-expanded': rightOpen } : {})}
              >
                {rightOpen ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
              </Button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden relative">
          <main className={ds ? THEMED.main : 'flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto'}>
            <div className="flex-1 flex flex-col overflow-hidden p-2 md:p-4 relative gap-4">
              {main}
            </div>
            {bottom && (
              <div className="flex-shrink-0 pt-4 px-4 pb-4">
                {bottom}
              </div>
            )}
          </main>

          {/* Right Sidebar */}
          {hasRight && (
          <div
            className={cn(
              ds ? cn(THEMED.rail, 'border-l max-lg:right-0 max-lg:inset-y-0') : 'flex-shrink-0 border-l border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20',
              rightOpen ? `${rightWidthClass} translate-x-0` : 'w-0 translate-x-full opacity-0 border-none'
            )}
          >
            <div className="flex-1 h-full overflow-y-auto overflow-x-hidden">
              <div className="p-4 space-y-6 min-w-0">
                {sidebarRight}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudioLayout;
