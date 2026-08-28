// Gas Well Performance Studio help content (Production P7).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Droplets, Gauge, CalendarClock, ArrowUpCircle, Ruler, Link2, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It answers three questions about a gas well: what it delivers today, whether it is still carrying its own liquid, and at what reservoir pressure it will stop. The last one is the reason the studio exists. A gas well dies of liquid loading far more often than it dies of depletion, and the pressure at which loading starts is what a tubing change, a plunger or a compressor gets justified against.',
  },
  {
    id: 'deliverability',
    icon: Gauge,
    title: 'Deliverability',
    content:
      'The gas inflow meets the gas column at the node, and where they cross is what the well makes. Three inflow routes are offered and all three are the validated nodal gas layer: back pressure (Rawlins and Schellhardt, the C and n form), laminar-inertial-turbulent (Houpeurt, the a and b form on pressure squared), and a pseudo-pressure deliverability that runs on real-gas m(p) and so stays honest at high pressure where the squared forms drift. The outflow is the Cullender and Smith column. Reservoir pressure, gas gravity and bottomhole temperature come from the well record rather than being asked for again.',
  },
  {
    id: 'loading',
    icon: Droplets,
    title: 'Liquid loading, and where Turner comes from',
    content:
      'A gas well carries its liquid up as entrained droplets. Below some velocity it cannot, droplets fall back, and the column that builds kills the well. The critical velocity is derived here rather than quoted: at terminal velocity drag balances weight less buoyancy, and the largest droplet that survives is set by a critical Weber number. Eliminating the droplet diameter between those two statements gives the whole equation, and with a drag coefficient of 0.44 and a Weber number of 30 the constant comes out at 1.5935 — the 1.593 the textbooks print. Deriving it means the drag coefficient and the Weber number are inputs you can argue with rather than numbers buried inside a constant.',
  },
  {
    id: 'turner-coleman',
    icon: Droplets,
    title: 'Turner and Coleman are one equation',
    content:
      'Turner found his field data sat about 20 percent above the theoretical velocity and applied that adjustment. Coleman, working on wells below about 1,000 psi at the wellhead, found the unadjusted equation fitted better. So the two differ by a single factor, and this studio treats them that way rather than as rival correlations. The guidance follows the pressure ranges each was fitted on, and choosing against it is allowed but reported, because the difference is only 20 percent and which one you trust is a judgement.',
  },
  {
    id: 'profile',
    icon: Ruler,
    title: 'Why the shoe controls, not the wellhead',
    content:
      'Critical rate is not one number for a well. It goes as roughly the square root of pressure, so it is highest at the bottom of the tubing, and it is the deepest point that decides whether the well loads. A well can sit comfortably above its critical rate at the wellhead, which is where the operator is looking, while loading at the shoe, which is where liquid actually collects. So the column is marched segment by segment and the check is run at every station; the controlling one is found rather than assumed. Temperature works the other way and partly cancels the pressure effect, which is why some wells come out almost uniform down the string and others do not.',
  },
  {
    id: 'forecast',
    icon: CalendarClock,
    title: 'When the well will load',
    content:
      'As the reservoir depletes the deliverability falls faster than the critical rate does, so the two curves cross. That crossing is the plan: it says how long the well has before it needs help. Each point on it is a full nodal solve and a marched gas column at that reservoir pressure, which is why it is an explicit run rather than something recomputed as you type. The deliverability coefficients are held across the forecast, so this is the same well depleted, not a different one.',
  },
  {
    id: 'tubing',
    icon: Ruler,
    title: 'Tubing as a fix',
    content:
      'Velocity goes as one over area, so a smaller string carries liquid at a lower gas rate. It is the commonest and cheapest answer to a loading well, and the studio screens the standard sizes at the controlling station and names the largest that still works. Treat it as a shortlist rather than a promise: a real re-completion changes the pressure profile as well as the area, and the friction a smaller string adds is not free.',
  },
  {
    id: 'plunger',
    icon: ArrowUpCircle,
    title: 'Plunger lift',
    content:
      'A plunger is a free piston. The well shuts in until the casing has built enough pressure to push the plunger and a slug of liquid to surface, then flows until it can no longer carry its liquid, then repeats. Feasibility here rests on physics, not on a rule of thumb: the pressure needed is a static force balance you can read term by term, and the gas a cycle needs comes from the real gas law over the swept tubing volume. Dividing the second by the liquid the cycle lifts gives the gas-liquid ratio the well must beat, and that is the verdict. The industry screening heuristic of roughly 400 scf per barrel per 1,000 ft is shown beside it and whether the two agree is surfaced, because a well between the two numbers is exactly where a heuristic misleads.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'The shared well model',
    content:
      'This studio is built on the shared per-well record rather than carrying its own copy of the well. The record holds what belongs to the well — trajectory, temperatures, fluid, inflow and completion — and a phase saying whether it is an oil well or a gas well; it deliberately does not hold the duty an analysis is run at, so changing a wellhead pressure here never rewrites the field record for everyone. Loading and saving are both deliberate acts, and the panel says when what you have differs from what the well holds.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What the studio refuses to do',
    content:
      'A well whose inflow never meets its own tubing is reported as not flowing at that wellhead pressure, rather than given a rate. An oil-phase well record is refused with a sentence rather than run through a gas inflow. An unknown critical-velocity correlation is refused rather than treated as one of the two. Interfacial tension and liquid density are never inferred: water and condensate differ by a factor of three in tension, nothing the studio knows predicts either, and Turner’s own values are offered as labelled starting points rather than as correlations.',
  },
];

const GasWellHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((section) => {
      const Icon = section.icon;
      return (
        <AccordionItem key={section.id} value={section.id} className="border-slate-800">
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2 text-left">
              <Icon className="w-4 h-4 text-sky-400 shrink-0" />
              {section.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 leading-relaxed">
            {section.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

export default GasWellHelpContent;
