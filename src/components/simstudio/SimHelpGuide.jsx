// Reservoir Simulation Studio help content, rendered inside StudioHelp.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, FolderOpen, FileText, Play, LineChart, Gauge, AlertTriangle, Scale,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Runs full black-oil reservoir simulations on OPM Flow, the leading open-source, Eclipse-deck-compatible simulator (opm-project.org). You bring an industry-standard input deck (or start from an SPE benchmark template); the platform queues it on a managed simulation worker, runs it, and charts the results. The simulator is the real engine used in published SPE comparative solution studies, not a toy.',
  },
  {
    id: 'cases',
    icon: FolderOpen,
    title: 'Cases',
    content:
      'A case is one deck plus its run history. Create a case in the left rail, then give it a deck on the Deck tab. Cases save to your account; organization members can view them read-only.',
  },
  {
    id: 'deck',
    icon: FileText,
    title: 'Step 1: The deck',
    content:
      'Upload an Eclipse-format .DATA file (plus any INCLUDE files), or install a bundled SPE template. You can edit the deck text in place; the worker validates everything again before running. Limits on this platform: 25 MB bundle, 40 files, 200,000 grid cells, 5,000 report steps. PYACTION/PYINPUT are not allowed (they embed executable code), and INCLUDE paths must stay inside the bundle.',
  },
  {
    id: 'builder',
    icon: FileText,
    title: 'No deck? Use the Model Builder',
    content:
      'The Builder tab generates a complete deck from engineering inputs: a layer-cake grid, black-oil PVT from the same correlations Fluid Studio uses (Standing, Beggs-Robinson; the bubble point is solved from your GOR), Corey relative permeability curves as in SCAL Studio with optional Leverett-J capillary pressure, equilibration contacts, vertical wells and a monthly schedule. Generate attaches the deck to the case; you can inspect and hand-edit it on the Deck tab before running.',
  },
  {
    id: 'run',
    icon: Play,
    title: 'Step 2: Run',
    content:
      'Run simulation queues the deck; the worker picks it up within about 10 seconds and the status updates every 5 seconds. Quotas: 2 runs in flight, 10 runs per day. A run that exceeds the 30-minute wall clock is stopped and marked timed out. Cancel works at any point. When a run fails, the actual simulator error is shown, along with a log excerpt; nothing is prettified into fake success.',
  },
  {
    id: 'results',
    icon: LineChart,
    title: 'Step 3: Results',
    content:
      'Completed runs expose their summary vectors: field rates, cumulatives, GOR, water cut and pressure where the deck requests them (the SUMMARY section of the deck decides what the simulator writes), plus per-well rates and BHP. Charts follow the suite standard, and the full table downloads as CSV.',
  },
  {
    id: 'engine',
    icon: Gauge,
    title: 'The engine and validation',
    content:
      'The worker runs OPM Flow pinned to a specific release, and every deployment must reproduce the OPM project reference solution of SPE1 (Odeh 1981) point-for-point within regression tolerance before it serves users. The simulator runs isolated with capped CPU, memory and time, and your files stay under your own private storage prefix.',
  },
  {
    id: 'attribution',
    icon: Scale,
    title: 'Licenses and attribution',
    content:
      'OPM Flow is GPLv3 open source, run as a separate engine (opm-project.org). The SPE1 and SPE9 template decks come from the OPM project data repository under the Open Database License (ODbL) 1.0, based on SPE comparative solution project papers (Odeh 1981; Killough 1995). Attribution files ship alongside the templates.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Scope and honesty',
    content:
      'This is screening-scale simulation: the worker is sized for models up to roughly 200,000 cells. Restart files, 3D grid visualization and compositional runs are not included yet. What you see is exactly what the simulator computed; failed runs stay failed, with the reason.',
  },
];

const SimHelpGuide = () => (
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
);

export default SimHelpGuide;
