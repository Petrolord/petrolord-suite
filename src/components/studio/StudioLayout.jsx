// Studio shell layout — the Reservoir-module workstation frame, generalized
// from the original DCA layout (retired in W5 when DCA adopted this kit) so every
// upgraded app shares one look: dark full-height frame, collapsible left/right
// ScrollArea rails, h-14 header bar. Fully props-driven; no app context.
//
// Design system: inside an opted-in <ThemedApp> scope the frame uses theme
// roles (light by default, dark by choice), and below the md breakpoint the
// rails float over the page and start closed so the main area keeps the
// phone's width. Outside a scope every class string is the legacy one, byte
// for byte (src/components/studio/__tests__/studioKitOptIn.test.jsx).
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import StudioNotifications from './StudioNotifications';
import StudioLoadingOverlay from './StudioLoadingOverlay';

// Phone widths: the themed rails start closed (they overlay the page there).
const isNarrow = () => {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 767px)').matches;
  } catch {
    return false;
  }
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
  const [leftOpen, setLeftOpen] = useState(() => (isNarrow() ? false : defaultLeftOpen));
  const [rightOpen, setRightOpen] = useState(() => (isNarrow() ? false : defaultRightOpen));
  const rail = (side) => `flex-shrink-0 ${side === 'left' ? 'border-r' : 'border-l'} border-pl-border bg-pl-surface transition-all duration-300 ease-in-out flex flex-col z-30 max-md:absolute max-md:inset-y-0 ${side === 'left' ? 'max-md:left-0 max-md:z-40' : 'max-md:right-0'} max-md:max-w-[85vw] max-md:shadow-pl-lg`;
  const railToggle = '';
  // Themed only: on a phone the rails float over the page, so each carries
  // its own close button.
  const railClose = (onClose) => (<div className="flex justify-end px-2 pt-2 md:hidden">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close panel">
        <X size={18} />
      </Button>
    </div>);
  // no right rail passed (Fluid, SCAL, Material Balance): no empty 24rem
  // column and no toggle for it (Wave 2 T1: the empty rail squeezed the
  // results so KPI values ran out of their cards at 1366 px)
  const hasRight = sidebarRight !== null && sidebarRight !== undefined && sidebarRight !== false;

  return (
    <div className={cn('relative flex h-screen w-full bg-pl-bg text-pl-text overflow-hidden', className)}>

      <StudioNotifications notifications={notifications} onDismiss={onDismissNotification} />

      {busyMessage && <StudioLoadingOverlay message={busyMessage} />}

      {/* Left Sidebar */}
      <div
        className={cn(
          rail('left'),
          leftOpen ? `${leftWidthClass} translate-x-0` : 'w-0 -translate-x-full opacity-0 border-none'
        )}
      >
        {/* a plain scroller: Radix ScrollArea wraps content in a display:table
            box that grows to its widest child, so long names pushed the rail's
            values and buttons out of view instead of truncating (Wave 2 T1) */}
        <div className="flex-1 h-full overflow-y-auto overflow-x-hidden">
          {railClose(() => setLeftOpen(false))}
          <div className="p-4 space-y-6 min-w-0">
            {sidebarLeft}
          </div>
        </div>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Header Bar */}
        <header className="min-h-14 flex-shrink-0 border-b border-pl-border bg-pl-surface flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1 sm:px-4 justify-between z-10 md:h-14 md:flex-nowrap md:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden max-md:basis-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftOpen(!leftOpen)}
              className={cn(railToggle, 'shrink-0')}
              aria-label={leftOpen ? 'Hide left panel' : 'Show left panel'}
              aria-expanded={leftOpen}
            >
              {leftOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </Button>
            <div className="flex-1 min-w-0">{header}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0 max-md:ml-auto">
            {headerActions}
            {hasRight && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightOpen(!rightOpen)}
                className={railToggle}
                aria-label={rightOpen ? 'Hide right panel' : 'Show right panel'}
                aria-expanded={rightOpen}
              >
                {rightOpen ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
              </Button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden relative">
          <main className="flex-1 flex flex-col min-w-0 bg-pl-bg overflow-y-auto">
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
              rail('right'),
              rightOpen ? `${rightWidthClass} translate-x-0` : 'w-0 translate-x-full opacity-0 border-none'
            )}
          >
            <div className="flex-1 h-full overflow-y-auto overflow-x-hidden">
              {railClose(() => setRightOpen(false))}
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
