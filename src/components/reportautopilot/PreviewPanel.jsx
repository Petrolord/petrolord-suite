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
    <div className="h-full flex flex-col bg-pl-surface rounded-xl border border-pl-border p-4">
      <div className="pb-4 border-b border-pl-border flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-pl-text">Generated Report Preview</h2>
        <div className="flex items-center gap-2">
          <Button onClick={onExport} disabled={exporting || !reportData}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export DOCX
          </Button>
        </div>
      </div>
      
      <div className="flex-grow mt-4 space-y-3 overflow-y-auto pr-2">
        <Accordion type="single" collapsible defaultValue="item-0" className="w-full">
            {reportData?.sections?.map((section, index) => (
              <AccordionItem value={`item-${index}`} key={index} className="border border-pl-border rounded-lg bg-pl-raised mb-2 px-2">
                  <AccordionTrigger className="font-semibold text-pl-text">{section.title}</AccordionTrigger>
                  <AccordionContent>
                      <div className="p-4 border-t border-pl-border text-pl-text leading-relaxed space-y-2 max-w-none">
                        {section.content.split('\n').map((paragraph, pIndex) => (
                          <div key={pIndex}>{paragraph}</div>
                        ))}
                      </div>
                  </AccordionContent>
              </AccordionItem>
            ))}
        </Accordion>
      </div>

       <div className="mt-4 p-3 bg-pl-info-bg rounded-lg border border-pl-info flex items-center gap-3">
          <Bot className="w-8 h-8 text-pl-info-text flex-shrink-0" />
          <div>
            <p className="font-semibold text-pl-text">This is an AI-generated draft.</p>
            <p className="text-sm text-pl-muted">Please review all content for accuracy and completeness before distribution.</p>
          </div>
        </div>
    </div>
  );
};

export default PreviewPanel;