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
import { useDsTheme, usePortalThemeProps } from '@/design/themeContext';

// Theme roles inside an opted-in <ThemedApp> scope (the Sheet is a portal, so
// its content carries the scope attribute itself); legacy classes outside.
const THEMED = {
  trigger: 'h-8 w-8 text-pl-muted hover:text-pl-text',
  content: 'w-[500px] max-w-full sm:w-[600px] bg-pl-raised border-l border-pl-border text-pl-text shadow-pl-lg',
  header: 'pb-4 border-b border-pl-border',
  title: 'text-xl font-bold text-pl-text flex items-center gap-2',
  icon: 'text-pl-primary-text',
  description: 'text-pl-muted',
};

const StudioHelp = ({
  title,
  description,
  icon: Icon = BookOpen,
  triggerTitle = 'Documentation',
  children,
}) => {
  const ds = useDsTheme();
  const portalProps = usePortalThemeProps();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={ds ? THEMED.trigger : 'h-8 w-8 text-slate-400 hover:text-white'} title={triggerTitle} {...(ds ? { 'aria-label': triggerTitle } : {})}>
          <HelpCircle size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent className={ds ? THEMED.content : 'w-[500px] sm:w-[600px] bg-slate-950 border-l border-slate-800 text-slate-100 shadow-2xl'} {...portalProps}>
        <SheetHeader className={ds ? THEMED.header : 'pb-4 border-b border-slate-800'}>
          <SheetTitle className={ds ? THEMED.title : 'text-xl font-bold text-slate-100 flex items-center gap-2'}>
            <Icon className={ds ? THEMED.icon : 'text-blue-500'} size={24} />
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className={ds ? THEMED.description : 'text-slate-400'}>
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
