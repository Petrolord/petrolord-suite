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

// Design system: the drawer (a portal; the ui SheetContent carries the
// scope attribute) uses theme roles.

const StudioHelp = ({
  title,
  description,
  icon: Icon = BookOpen,
  triggerTitle = 'Documentation',
  children,
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title={triggerTitle} aria-label={triggerTitle}>
          <HelpCircle size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-full sm:w-[600px] sm:max-w-[600px] bg-pl-raised border-l border-pl-border text-pl-text shadow-pl-lg">
        <SheetHeader className="pb-4 border-b border-pl-border">
          <SheetTitle className="text-xl font-semibold text-pl-text flex items-center gap-2">
            <Icon className="text-pl-primary-text" size={24} />
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-pl-muted">
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
