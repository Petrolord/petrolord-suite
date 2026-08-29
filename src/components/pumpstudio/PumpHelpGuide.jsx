// Pump Station Designer help content (Facilities F10).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, GitMerge, Droplets, Gauge, Settings, Layers, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Sizes and checks a centrifugal pump against the system it actually has to work into. It solves the duty point, the power, the suction margin and where the duty sits relative to best efficiency, and it answers what a trim, a speed change or a second pump in parallel would do. It is a selection and troubleshooting tool: it does not replace a vendor performance test on a specific machine.',
  },
  {
    id: 'duty',
    icon: GitMerge,
    title: 'A pump has no duty point on its own',
    content:
      'A pump curve says what head the machine makes at each flow. A system curve says what head the piping demands at each flow. Neither one has an operating point; the pump runs where they cross, and nowhere else. Everything in this studio hangs off that solved intersection rather than a duty somebody typed in, which is what keeps the follow-on questions honest: change the system and the point moves, and so does the power, the efficiency and the suction margin.',
  },
  {
    id: 'npsh',
    icon: Droplets,
    title: 'NPSH, and why margin is not the same as adequacy',
    content:
      'Net positive suction head available is built from the real suction side: the pressure over the liquid less its vapour pressure, converted to feet of that liquid, plus or minus the static height, less the suction friction. Comparing it to the required value is not enough on its own, because the required value is itself measured at a three percent head drop, meaning the pump is already cavitating a little at exactly NPSHa equals NPSHr. The customary margin is the larger of three feet and thirty-five percent of required, and this studio judges against that rather than against bare equality.',
  },
  {
    id: 'bep',
    icon: Gauge,
    title: 'Where the duty sits matters as much as what it is',
    content:
      'A pump run far from its best efficiency point does not merely waste power. Below about seventy percent of best efficiency flow, suction and discharge recirculation begin and bearing and seal life shorten. Above about a hundred and twenty percent, the required suction head climbs steeply, so a pump that had margin at design can cavitate when it runs out on the curve. The studio names the region and what it costs, because a pump that works and a pump that works for a fortnight look identical on a datasheet.',
  },
  {
    id: 'changes',
    icon: Settings,
    title: 'Trims, speeds and what they really buy',
    content:
      'A speed change follows the affinity laws exactly for a geometrically similar machine: flow with speed, head with the square, power with the cube. An impeller trim does not. A cut impeller no longer matches its casing, and the shortfall against the ideal law grows with the depth of the cut, which is why a trim is usually a one-way adjustment made once and a variable speed drive is the better answer when the duty has to move. The studio shows the ideal and the real side by side rather than quoting the ideal alone.',
  },
  {
    id: 'multiples',
    icon: Layers,
    title: 'Two pumps in parallel are not twice one pump',
    content:
      'Parallel pumps add flow at equal head, series pumps add head at equal flow. The catch with parallel is the system: friction head rises with the square of flow, so adding a second identical pump to a friction-dominated system buys far less than twice the flow, sometimes barely thirty percent more. The studio solves the combined duty rather than doubling, because the difference between those two answers is a great deal of money in machinery that does not deliver.',
  },
  {
    id: 'viscosity',
    icon: AlertTriangle,
    title: 'A catalogue curve is a water curve',
    content:
      'Pump curves are published on water. On anything heavier the pump delivers less flow at less head and considerably less efficiency, and the Hydraulic Institute method quantifies all three. At a few hundred centistokes a centrifugal can lose nearly half its efficiency, and past the range of the correlation the honest answer is that a centrifugal is the wrong machine and the service wants a positive-displacement pump. The studio says so rather than extrapolating a correction that has stopped meaning anything.',
  },
];

const PumpHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => (
      <AccordionItem key={item.id} value={item.id}>
        <AccordionTrigger className="text-sm text-left">
          <span className="flex items-center gap-2">
            <item.icon className="w-4 h-4 text-emerald-400 shrink-0" />
            {item.title}
          </span>
        </AccordionTrigger>
        <AccordionContent className="text-sm text-slate-400 leading-relaxed">
          {item.content}
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

export default PumpHelpContent;
