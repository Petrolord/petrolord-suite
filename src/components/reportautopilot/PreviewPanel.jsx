import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"


// Rebuild 2026-08-29: the DOCX is built in the browser and saved directly, so
// there is no download link from a service to hold on to.
const PreviewPanel = ({ reportData, onExport, exporting }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900/50 rounded-xl border border-white/10 p-4">
      <div className="pb-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Generated Report Preview</h2>
        <div className="flex items-center gap-2">
          <Button onClick={onExport} disabled={exporting || !reportData} className="bg-blue-600 hover:bg-blue-700">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export DOCX
          </Button>
        </div>
      </div>
      
      <div className="flex-grow mt-4 space-y-3 overflow-y-auto pr-2">
        <Accordion type="single" collapsible defaultValue="item-0" className="w-full">
            {reportData?.sections?.map((section, index) => (
              <AccordionItem value={`item-${index}`} key={index} className="border border-slate-700 rounded-lg bg-slate-800/50 mb-2 px-2">
                  <AccordionTrigger className="font-semibold text-lime-300">{section.title}</AccordionTrigger>
                  <AccordionContent>
                      <div className="p-4 border-t border-slate-700 text-slate-300 prose prose-invert max-w-none prose-p:my-2">
                        {section.content.split('\n').map((paragraph, pIndex) => (
                          <div key={pIndex}>{paragraph}</div>
                        ))}
                      </div>
                  </AccordionContent>
              </AccordionItem>
            ))}
        </Accordion>
      </div>

       <div className="mt-4 p-3 bg-gradient-to-r from-blue-500/10 to-violet-500/10 rounded-lg border border-blue-400/30 flex items-center gap-3">
          <Bot className="w-8 h-8 text-blue-300 flex-shrink-0" />
          <div>
            <p className="font-semibold text-white">This is an AI-generated draft.</p>
            <p className="text-sm text-slate-400">Please review all content for accuracy and completeness before distribution.</p>
          </div>
        </div>
    </div>
  );
};

export default PreviewPanel;