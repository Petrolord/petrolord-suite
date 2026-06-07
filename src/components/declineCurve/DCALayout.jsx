import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import DCAAutoSave from './DCAAutoSave';
import DCAHelp from './DCAHelp';
import DCANotifications from './DCANotifications';
import { LoadingOverlay } from './DCALoadingStates';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';

const DCALayout = ({ 
  sidebarLeft,
  sidebarRight,
  header, 
  main, 
  bottom, 
  className 
}) => {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const { isFitting, isForecasting } = useDeclineCurve();

  return (
    <div className={cn("flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden", className)}>
      
      <DCANotifications />
      
      {(isFitting || isForecasting) && (
        <LoadingOverlay message={isFitting ? "Fitting Model..." : "Generating Forecast..."} />
      )}

      {/* Left Sidebar */}
      <div 
        className={cn(
          "flex-shrink-0 border-r border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20",
          leftOpen ? "w-80 translate-x-0" : "w-0 -translate-x-full opacity-0 border-none"
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
            <DCAAutoSave />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            <DCAHelp />
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
          {/* Main Chart Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto"> {/* Added overflow-y-auto here */}
            <div className="flex-1 flex flex-col overflow-hidden p-2 md:p-4 relative gap-4">
              {main}
            </div>
            {/* Bottom Panel Area inside Main for better layout control */}
            {bottom && (
              <div className="flex-shrink-0 pt-4 px-4 pb-4"> {/* Adjusted styling here */}
                {bottom}
              </div>
            )}
          </main>

          {/* Right Sidebar (Diagnostics & Comparison) */}
          <div 
            className={cn(
              "flex-shrink-0 border-l border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20",
              rightOpen ? "w-96 translate-x-0" : "w-0 translate-x-full opacity-0 border-none"
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

export default DCALayout;