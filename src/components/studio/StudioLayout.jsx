// Studio shell layout — the Reservoir-module workstation frame, generalized
// from the DCA layout (src/components/declineCurve/DCALayout.jsx) so every
// upgraded app shares one look: dark full-height frame, collapsible left/right
// ScrollArea rails, h-14 header bar. Fully props-driven; no app context.
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import StudioNotifications from './StudioNotifications';
import StudioLoadingOverlay from './StudioLoadingOverlay';

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

  return (
    <div className={cn('flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden', className)}>

      <StudioNotifications notifications={notifications} onDismiss={onDismissNotification} />

      {busyMessage && <StudioLoadingOverlay message={busyMessage} />}

      {/* Left Sidebar */}
      <div
        className={cn(
          'flex-shrink-0 border-r border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20',
          leftOpen ? `${leftWidthClass} translate-x-0` : 'w-0 -translate-x-full opacity-0 border-none'
        )}
      >
        <ScrollArea className="flex-1 h-full">
          <div className="p-4 space-y-6">
            {sidebarLeft}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Header Bar */}
        <header className="h-14 flex-shrink-0 border-b border-slate-800 bg-slate-900/80 flex items-center px-4 justify-between z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftOpen(!leftOpen)}
              className="text-slate-400 hover:text-white shrink-0"
            >
              {leftOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </Button>
            <div className="flex-1 min-w-0">{header}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightOpen(!rightOpen)}
              className="text-slate-400 hover:text-white"
            >
              {rightOpen ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden relative">
          <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto">
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
          <div
            className={cn(
              'flex-shrink-0 border-l border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20',
              rightOpen ? `${rightWidthClass} translate-x-0` : 'w-0 translate-x-full opacity-0 border-none'
            )}
          >
            <ScrollArea className="flex-1 h-full">
              <div className="p-4 space-y-6">
                {sidebarRight}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudioLayout;
