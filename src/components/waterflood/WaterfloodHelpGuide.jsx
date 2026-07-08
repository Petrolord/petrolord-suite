import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Table2, Scale, LineChart, GitBranch, Gauge, Activity, Droplets, Save, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this dashboard does',
    content:
      "The Waterflood Efficiency Dashboard turns daily injection and production history into surveillance analytics: voidage replacement (VRR), rates and water cut, injector–producer response, VRR-balanced rate recommendations, Hall-plot injectivity, and Chan water-control diagnostics. Every number is computed in your browser from the data you provide — there is no hidden server model, and any analysis that the data can't support is withheld rather than estimated.",
  },
  {
    id: 'data',
    icon: Table2,
    title: 'Data & schema',
    content:
      "Upload a CSV (or paste JSON) with one row per well per day. Required: date (YYYY-MM-DD) and well. Optional: oil_bbl, water_bbl, gas_mcf (production), inj_bbl (injection) and whp_psi (measured injection pressure). A well is an INJECTOR if it ever reports non-zero inj_bbl, a PRODUCER if it reports oil or water. Blank cells are zero; negatives are zeroed and counted; duplicate (date, well) rows are dropped. Set the date range to focus on a period. Click Load Sample to explore with a realistic 90-day, two-pattern dataset.",
  },
  {
    id: 'pvt',
    icon: Scale,
    title: 'PVT settings & reservoir-barrel VRR',
    content:
      "VRR is computed in reservoir barrels, so set Bo (RB/STB), Bw (RB/bbl), Bg (RB/Mscf) and Rs (scf/STB). Produced voidage = Np·Bo + Wp·Bw + free-gas·Bg; injected voidage = Wi·Bw. Solution gas (Rs·Np) is already carried in Bo, so only free produced gas above solution adds voidage — the engine subtracts it. Leave Bg = 0 to use liquid-only voidage. This is the same voidage core used by the Voidage Replacement Monitor, so the two apps agree.",
  },
  {
    id: 'vrr',
    icon: LineChart,
    title: 'Reading the VRR trend',
    content:
      "The VRR chart shows instantaneous (daily), rolling-window and cumulative VRR against a reference line at VRR = 1. VRR ≈ 1 (0.9–1.1): balanced, pressure maintained. VRR < 0.9: under-injection — expect pressure decline. VRR > 1.1: over-injection — repressurizing or filling up voidage (watch for out-of-zone injection). The cumulative line reflects the reservoir's overall voidage balance since the start of the record; a field that under-injected early stays below 1 cumulatively even after instantaneous VRR recovers.",
  },
  {
    id: 'pattern',
    icon: GitBranch,
    title: 'Pattern Response (cross-correlation)',
    content:
      "For every injector–producer pair the engine detrends both rate histories (first differences, to remove the shared field trend) and computes a time-lagged cross-correlation. The lag with the strongest positive correlation is the apparent response time; only pairs above a correlation threshold are shown. This flags likely communication and its timing — but correlation is not proof of connectivity, and it needs overlapping, reasonably clean daily rates. Pairs that don't clear the threshold are simply omitted.",
  },
  {
    id: 'recommend',
    icon: Gauge,
    title: 'Injector Recommendations',
    content:
      "Over the most recent VRR-window of DATA (not wall-clock time), the engine computes field produced and injected voidage, then scales every injector's recent average rate by target_VRR ÷ current_VRR so overall voidage replacement lands on your target. These are field-level balancing suggestions, not a per-pattern geometric optimization — that would need well spacing and connectivity the schema doesn't carry. Use them as a starting allocation, then refine with pattern response and pressure.",
  },
  {
    id: 'hall',
    icon: Activity,
    title: 'Hall Plot (injectivity)',
    content:
      "When injector rows include whp_psi, the engine plots the Hall integral (Σ pressure·Δt) against cumulative injection. The local slope is pressure ÷ rate — the flow resistance. A recent-window regression slope well above the early baseline (rising p/q) signals declining injectivity (rising skin or near-well plugging) and raises an alert; a slope well below baseline signals improving injectivity (possible fracturing or thief-zone channeling). Without measured pressure this analysis is withheld.",
  },
  {
    id: 'chan',
    icon: Droplets,
    title: 'Chan Water-Control Diagnostics',
    content:
      "Chan (SPE 30775) plots the water–oil ratio WOR and its time derivative WOR′ on log–log axes vs time. The SHAPE of WOR′ points to the excess-water mechanism: a rising WOR′ roughly parallel to WOR indicates channeling (multilayer, fracture or behind-pipe communication); a flat-to-declining WOR′ indicates coning or normal displacement. The dashboard shows the plot per producer (and field aggregate) with the computed late-time WOR′ slope and an indicative label — always confirm the mechanism against completion, geology and pressure before acting.",
  },
  {
    id: 'save',
    icon: Save,
    title: 'Saving & loading projects',
    content:
      "Save stores your data and configuration under your account (row-level security keeps projects private to you) and lists them in the central My Projects view. Loading a project restores your inputs and recomputes the results with the current engine — so a saved case always reflects the latest, correct calculations. Reservoir selection is optional and used to organize work; results are computed purely from the uploaded rates.",
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "These are material-balance and rate-diagnostic tools, not a reservoir simulation. VRR says nothing about sweep efficiency — a VRR of 1 with poor conformance still leaves oil behind. Cross-correlation, Hall and Chan are diagnostic aids that assume correctly allocated volumes and reasonable data quality; they inform engineering judgment rather than replace it. When the data can't support an analysis (no injectors, no pressure, too little water history) the dashboard says so instead of showing a number you might mistake for a result.",
  },
];

const WaterfloodHelpGuide = ({ isOpen, onOpenChange }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[640px] bg-slate-900 border-slate-700 text-white">
      <DialogHeader>
        <DialogTitle className="text-lime-300 text-xl">Waterflood Efficiency Dashboard — Help Guide</DialogTitle>
        <DialogDescription>
          Data, methods and how to read each surveillance analytic.
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

export default WaterfloodHelpGuide;
