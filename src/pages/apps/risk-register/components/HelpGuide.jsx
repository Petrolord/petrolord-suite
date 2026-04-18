import React from 'react';
import { X, Search, BookOpen, Key, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';

export const HelpGuide = ({ isOpen, onClose }) => {
  const { toast } = useToast();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          Help Guide
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input 
            placeholder="Search help topics..." 
            className="pl-9 bg-slate-950 border-slate-800 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-sm">Getting Started</AccordionTrigger>
            <AccordionContent className="text-xs text-slate-400">
              Welcome to the Risk Register. Use the tabs above to navigate between Dashboard, Register, Heatmap, and Reports. Click 'Record New Risk' to add entries.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger className="text-sm">Scoring Help</AccordionTrigger>
            <AccordionContent className="text-xs text-slate-400">
              Risk Score is calculated as Likelihood × Impact (both 1-5 scale). Max score is 25.
              <br/><br/>
              Bands:
              <br/>• Low: 1-4
              <br/>• Medium: 5-9
              <br/>• High: 10-14
              <br/>• Critical: 15-25
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger className="text-sm">Workflow & Best Practices</AccordionTrigger>
            <AccordionContent className="text-xs text-slate-400">
              Regularly review 'Open' and 'Under Review' risks. Assign owners and establish clear mitigation summaries. Use Advanced Reports to share progress with stakeholders.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-8 space-y-2">
          <Button variant="outline" className="w-full justify-start text-xs border-slate-800" onClick={() => toast({description: "Keyboard shortcuts guide coming soon!"})}>
            <Key className="w-4 h-4 mr-2 text-slate-400" /> Keyboard Shortcuts
          </Button>
          <Button variant="outline" className="w-full justify-start text-xs border-slate-800" onClick={() => toast({description: "Contacting support..."})}>
            <PhoneCall className="w-4 h-4 mr-2 text-slate-400" /> Contact Support
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
};