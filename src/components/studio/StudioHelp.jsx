// Studio shell help drawer — right-side Sheet chrome with app-specific
// content as children (generalized from DCAHelp).
import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { HelpCircle, BookOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStudioTheme } from './studioTheme';

// Design system: inside a <ThemedApp> scope the drawer (a portal; the ui
// SheetContent carries the scope attribute) uses theme roles; outside one it
// renders as before.

const StudioHelp = ({
  title,
  description,
  icon: Icon = BookOpen,
  triggerTitle = 'Documentation',
  children,
}) => {
  const { ds, tc } = useStudioTheme();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={tc('h-8 w-8 text-slate-400 hover:text-white', 'h-8 w-8')} title={triggerTitle} aria-label={ds ? triggerTitle : undefined}>
          <HelpCircle size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent className={tc('w-[500px] sm:w-[600px] bg-slate-950 border-l border-slate-800 text-slate-100 shadow-2xl', 'w-full max-w-full sm:w-[600px] sm:max-w-[600px] bg-pl-raised border-l border-pl-border text-pl-text shadow-pl-lg')}>
        <SheetHeader className={tc('pb-4 border-b border-slate-800', 'pb-4 border-b border-pl-border')}>
          <SheetTitle className={tc('text-xl font-bold text-slate-100 flex items-center gap-2', 'text-xl font-semibold text-pl-text flex items-center gap-2')}>
            <Icon className={tc('text-blue-500', 'text-pl-primary-text')} size={24} />
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className={tc('text-slate-400', 'text-pl-muted')}>
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] pr-6 pt-6">
          <div className="space-y-6 pb-10">
            {children}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default StudioHelp;
