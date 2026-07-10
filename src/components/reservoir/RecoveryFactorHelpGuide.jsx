import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Layers, Percent, Calculator, BarChart3, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this estimates',
    content:
      "The Recovery Factor (RF) is the fraction of oil- or gas-in-place that you expect to produce. This tool closes the volumetrics-to-reserves bridge: Recoverable Reserves = RF × OOIP (or OGIP). It gives you a defensible RF and a low/typical/high reserves band, either from published drive-mechanism analog ranges or from empirical correlations.",
  },
  {
    id: 'inplace',
    icon: Layers,
    title: 'Step 1: In-place volume (OOIP / OGIP)',
    content:
      "Enter OOIP (STB) or OGIP (scf) directly if you already have it from a volumetrics study, or use the built-in volumetric calculator: OOIP = 7758·A·h·φ·(1−Sw)·NTG / Boi. Area in acres, thickness in ft, porosity and saturations as fractions. This is the same relation used by the volumetrics apps, so numbers carry across cleanly.",
  },
  {
    id: 'analog',
    icon: Percent,
    title: 'Step 2: Method — drive-mechanism analog (default)',
    content:
      "Pick the reservoir's primary drive mechanism. The tool returns a published low/typical/high recovery band for that mechanism — e.g. solution-gas drive 5–30%, water drive 35–75%, volumetric gas 70–90%. These are screening ranges from industry literature; they are transparent and hard to abuse, and they always appear as a sanity band alongside any correlation result.",
  },
  {
    id: 'correlations',
    icon: Calculator,
    title: 'Step 2 (alt): Correlations',
    content:
      "For a point estimate you can use the API (1967) solution-gas-drive or water-drive correlations (rock, fluid and pressure inputs), or — for gas — the exact p/z depletion relation RF = 1 − (pa/za)/(pi/zi). The API correlations are empirical fits with wide scatter and are flagged with a warning: always compare them to the analog band before trusting them.",
  },
  {
    id: 'read',
    icon: BarChart3,
    title: 'Step 3: Read the reserves band',
    content:
      "The KPI cards show the selected RF and the recoverable reserves, and the chart shows the low / estimate / high reserves range so you can see the uncertainty at a glance. Use the analog band as your P90–P10 screening spread until you have simulation or analog-field data to tighten it.",
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "This is a screening tool, not a substitute for reservoir simulation or a full reserves study. Analog ranges are broad and field-specific; correlations were derived from limited datasets and can be well off for any single reservoir. Recovery also depends on development plan, well count, secondary/tertiary recovery and economics — none of which are captured here. Treat the output as an early-stage estimate to be refined.",
  },
];

const RecoveryFactorHelpGuide = ({ isOpen, onOpenChange }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[620px] bg-slate-900 border-slate-700 text-white">
      <DialogHeader>
        <DialogTitle className="text-lime-300 text-xl">Recovery Factor Estimator — Help Guide</DialogTitle>
        <DialogDescription>
          How to estimate recovery factor and convert in-place volumes to reserves.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="h-[60vh] pr-4">
        <Accordion type="single" collapsible className="w-full" defaultValue="what">
          {helpContent.map((item) => {
            const Icon = item.icon;
            return (
              <AccordionItem value={item.id} key={item.id}>
                <AccordionTrigger className="text-base hover:no-underline">
                  <div className="flex items-center">
                    <Icon className="w-5 h-5 mr-3 text-lime-400" />
                    {item.title}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-slate-300 pl-8 leading-relaxed">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

export default RecoveryFactorHelpGuide;
