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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" title={triggerTitle}>
          <HelpCircle size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[500px] sm:w-[600px] bg-slate-950 border-l border-slate-800 text-slate-100 shadow-2xl">
        <SheetHeader className="pb-4 border-b border-slate-800">
          <SheetTitle className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Icon className="text-blue-500" size={24} />
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-slate-400">
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
