import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Droplets, Table2, LineChart, Scale, Upload, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What is VRR?',
    content:
      "The Voidage Replacement Ratio (VRR) is the classic waterflood / pressure-maintenance surveillance metric: the reservoir-barrels of fluid injected divided by the reservoir-barrels of voidage produced over the same period. VRR ≈ 1 means the voidage you take out of the reservoir is being replaced by injection, so pressure is held. This tool tracks both instantaneous (per-period) and cumulative VRR over time.",
  },
  {
    id: 'pvt',
    icon: Droplets,
    title: 'Step 1: Set PVT / formation volume factors',
    content:
      "All volumes are converted to reservoir barrels (RB) before the ratio is taken, so the engine needs your fluid properties: Bo (oil FVF, RB/STB), Bw (water FVF, RB/STB), Bg (gas FVF, RB/Mscf) and Rs (solution GOR, scf/STB). These apply to every period unless you override them per row. Solution gas (Rs × Np) is already carried in Bo, so only free produced gas above solution adds to voidage — the engine subtracts it automatically.",
  },
  {
    id: 'periods',
    icon: Table2,
    title: 'Step 2: Enter production & injection by period',
    content:
      "Add one row per surveillance period (typically a month). Enter oil produced (Np, STB), water produced (Wp, STB), gas produced (Gp, Mscf), water injected (Wi, bbl) and gas injected (Gi, Mscf). Produced voidage = Np·Bo + Wp·Bw + free-gas·Bg; injected voidage = Wi·Bw + Gi·Bg. Leave a cell blank and it counts as zero.",
  },
  {
    id: 'read',
    icon: LineChart,
    title: 'Step 3: Read the VRR trend',
    content:
      "The chart plots instantaneous VRR (this period alone) and cumulative VRR (all periods to date) against a reference line at VRR = 1. The instantaneous line tells you what's happening right now; the cumulative line smooths out monthly noise and reflects the reservoir's overall voidage balance since the start of the record.",
  },
  {
    id: 'interpret',
    icon: Scale,
    title: 'Interpreting the number',
    content:
      "VRR ≈ 1 (0.9–1.1): balanced — voidage is being replaced, effective pressure maintenance. VRR < 0.9: under-injection — you're withdrawing faster than you replace, so expect reservoir pressure to decline. VRR > 1.1: over-injection — injecting more than produced, repressurizing the reservoir or filling up voidage (watch for fracturing or out-of-zone injection).",
  },
  {
    id: 'data',
    icon: Upload,
    title: 'Sample data, import & export',
    content:
      "Click Sample to load a realistic 6-month waterflood dataset and see the whole workflow immediately. Use Export to download your table as CSV, and Import to load a CSV back in (columns: label, Np, Wp, Gp, Wi, Gi). This makes it easy to keep monthly surveillance in a spreadsheet and paste updates in.",
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "VRR is a material-balance surveillance ratio, not a full reservoir simulation. It assumes your FVFs are representative for the period and that reported volumes are allocated correctly to this pattern or reservoir. It says nothing about sweep efficiency or where injected fluid actually goes — a VRR of 1 with poor conformance can still leave oil behind. Use it alongside pressure data and pattern analysis.",
  },
];

const VrrHelpGuide = ({ isOpen, onOpenChange }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[620px] bg-slate-900 border-slate-700 text-white">
      <DialogHeader>
        <DialogTitle className="text-lime-300 text-xl">Voidage Replacement Monitor — Help Guide</DialogTitle>
        <DialogDescription>
          How to track voidage replacement and read the VRR trend.
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

export default VrrHelpGuide;
