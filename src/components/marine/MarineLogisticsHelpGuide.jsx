// Marine Logistics Planner help guide (SC4).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Database, FolderOpen, Route, Ship, Dices, LayoutGrid, Anchor, AlertTriangle, Library,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

export const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What the planner does',
    content:
      'The planner works through the supply of an offshore cluster the way a marine logistics planner does: what one voyage can carry and which limit it hits first, how many supply vessels a period of demand needs, how exposed that fleet is to weather and demand, how deck cargo packs onto a voyage, and how long vessels queue at the supply base. Every figure comes from the Petrolord marine logistics engine (engines/supplychain/marineLogistics.js), the same engine the NextGen course on offshore and marine logistics teaches with.',
  },
  {
    id: 'inputs',
    icon: AlertTriangle,
    title: 'Every input is yours to state',
    content:
      'No speed, distance, time, capacity, fraction, fuel rate, price, weather factor or rounding rule is filled in behind your back. A new study starts blank. When a required input is missing or out of range, the engine refuses and the planner prints its message word for word, naming the input it refused, so you can see exactly what to fix.',
  },
  {
    id: 'data',
    icon: Database,
    title: 'Installations, demand and the Ekene demo',
    content:
      'Load the Ekene demo to see every calculation run on a synthetic cluster for block EK-11, Petrolord\'s fictional teaching field: four installations, a PSV and an AHTS, a week of demand, one voyage of cargo and the supply base. The demo also states the choices the file leaves open (the PSV on the milk run, rounding up, one deck voyage, the M/M/c model and a one-hour target), and each one is shown in its control. To use your own data, paste installations as CSV or a whole data set as JSON in the demo file\'s shape. A key or column the planner does not read is refused by name.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the cluster, the deck, the base and every calculation input auto-save, with the engine commit they ran on. Results are recomputed from the inputs when a study is opened.',
  },
  {
    id: 'voyage',
    icon: Route,
    title: 'Voyage plan and the binding constraint',
    content:
      'A milk run sails from the base through every installation once, in the stated order, and back; a dedicated voyage goes out to one installation and back. Sailing hours are distance over speed; the weather factor multiplies the time of the activities you tick, and fuel is hours in each activity times the stated burn. Utilisation is reported for deck area (clear area times the usable fraction), deck load, cargo deadweight (deck weight plus each bulk product at its density) and each tank. The binding constraint is the one with the highest utilisation; a tie goes to the first in that order.',
  },
  {
    id: 'fleet',
    icon: Ship,
    title: 'Fleet sizing and its rounding rules',
    content:
      'For each voyage set, voyages in the period are the larger of the demand over one voyage\'s capacity (on the constraint that needs the most voyages) and the minimum visits, and the planner names which one drove the count. Voyages are rounded up to whole voyages or left as a fractional average, as you state. Vessel-days are voyages times voyage days; vessels are vessel-days over the days a vessel is available, rounded up, to the nearest whole vessel with halves up, or not at all. Spare or short vessel-days and fleet utilisation follow.',
  },
  {
    id: 'variability',
    icon: Dices,
    title: 'Fleet variability and the P-labels',
    content:
      'The weather factor and a demand factor that multiplies every installation\'s demand can each be fixed or triangular. The engine draws them from one seeded stream (the canonical Petrolord sampler), weather first, and sizes the fleet in each iteration exactly as the Fleet sizing tab does, so a seed reproduces a run exactly. The probability short is the share of iterations whose vessel-days exceed the planned vessels times the available days. P-labels follow the Petrolord percentile convention: P90 means a 90% probability the actual value meets or exceeds it, so for a vessel requirement P90 is the low figure (the 10th percentile) and P10 the high one.',
  },
  {
    id: 'deck',
    icon: LayoutGrid,
    title: 'Deck plan: first-fit decreasing and first fit',
    content:
      'Each cargo line is split into units of its footprint (length times width) and weight. First-fit decreasing sorts the units largest footprint first; first fit keeps the order booked. Each unit goes to the first voyage whose usable area and deck load still hold it, and a unit that fits no voyage is left behind and named with its reason. The reason states what the unit needs and the most usable area and deck load left on any voyage at its turn, each marked short or enough, and names the limit that stops it. A unit larger than the usable area or heavier than the deck load is listed apart as one no voyage can carry. The lower bound counts only the units that fit an empty voyage: the larger of their total area over usable area and their total weight over deck load, rounded up, and 0 when no unit fits. The plan is an area bound, with no stacking and no check of shapes.',
  },
  {
    id: 'shore',
    icon: Anchor,
    title: 'The supply base queue',
    content:
      'The queue runs on the working-hour clock. A call\'s service is the fixed hours plus the crane lifts at the lift rate and the bulk at the pump rate, either one after the other or at the same time. Berth utilisation is arrivals an hour times service hours over the berths and must stay below 1. M/M/c gives the probability of waiting and the mean wait by Erlang\'s C formula. M/D/c, for a constant service time, is an approximation (Cosmetatos), exact for one berth, and gives no probability of waiting. With a target mean wait, the engine finds the fewest berths that meet it.',
  },
  {
    id: 'sources',
    icon: Library,
    title: 'Sources',
    content:
      'I. Adan and J. Resing, Queueing Systems, lecture notes, TU Eindhoven, 2015: M/M/c (chapter 5), Little\'s law, the Pollaczek-Khinchin formula and the Erlang B recursion. V. B. Iversen, Teletraffic Engineering Handbook, ITU-D and ITC, 2001: Erlang\'s C formula, Example 12.3.1. G. Cosmetatos, INFOR 13, 1975, as printed by Liu, Pantelidis, Tam and Chow (arXiv 2102.05851, CC BY 4.0): the M/D/c approximation. I. Skoko, Z. Lusic, Z. Sanchez-Varela and Z. Boko, J. Mar. Sci. Eng. 12(2), 263, 2024 (CC BY 4.0): fuel by activity and sailing time. B. Aas, O. Halskau and S. W. Wallace, Maritime Economics & Logistics 11, 2009: deck cargo in square metres and segregated bulk tanks, taught by concept. D. S. Johnson, 1973: first-fit decreasing. The engine is checked against these worked examples by an independent oracle.',
  },
];

export const MarineLogisticsHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem value={item.id} key={item.id}>
          <AccordionTrigger className="text-base hover:no-underline">
            <div className="flex items-center">
              <Icon className="mr-3 h-5 w-5 text-sky-400" />
              {item.title}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pl-8 leading-relaxed text-slate-300">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

const MarineLogisticsHelpGuide = () => (
  <StudioHelp
    title="Marine Logistics Planner"
    description="Voyage plans, fleet sizing, fleet variability, deck plans and the supply base queue, every input stated."
  >
    <MarineLogisticsHelpContent />
  </StudioHelp>
);

export default MarineLogisticsHelpGuide;
