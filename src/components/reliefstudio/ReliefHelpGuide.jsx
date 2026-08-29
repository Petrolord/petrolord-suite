// Relief & Flare Studio help content (Facilities F2).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Gauge, Droplets, Flame, CircleDot, Sun, Timer, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It sizes a pressure safety valve to API 520 for the scenario you state, chains the API 521 fire case from vessel geometry to orifice, screens the flare knockout drum, answers the radiation question both ways, and marches a vessel blowdown. Every number is a published equation with its factors visible; where the standard publishes a chart instead of an equation, the factor is an input with its reference named, because reading a curve for you and getting it silently wrong would be worse than asking.',
  },
  {
    id: 'gas',
    icon: Gauge,
    title: 'Gas sizing and the critical ratio',
    content:
      'A relief valve nozzle chokes when the back pressure is below the critical ratio, which comes from the heat capacity ratio alone. Below it, the flow is fixed by the upstream pressure and the standard C coefficient; above it, the F2 subcritical equation applies and the back pressure enters the sizing itself. The studio decides which branch you are on rather than asking you to know, and the two branches meet at the ratio, which is how you can tell neither is transcribed wrongly. The balanced-bellows back-pressure factor Kb is a published chart, so above 30 percent back pressure the studio warns and expects the chart value typed.',
  },
  {
    id: 'liquid',
    icon: Droplets,
    title: 'Liquid sizing and viscosity',
    content:
      'The certified-valve liquid equation with the published viscosity correction. Kv depends on the Reynolds number, which depends on the orifice area, which depends on Kv, so the studio iterates the loop to its fixed point instead of guessing once. When Kv falls below about half, the service is far off the certified test envelope and the studio says so.',
  },
  {
    id: 'fire',
    icon: Flame,
    title: 'The fire case',
    content:
      'API 521 pool fire: the heat input is 21000 F A to the 0.82 power with adequate drainage and firefighting, 34500 without, where A is the WETTED area, computed here from the vessel geometry and liquid level by exact circular-segment arithmetic. Only wetted surface below 25 feet above grade counts, so trim the level for tall or elevated vessels. The vapor generated is the duty over the latent heat, and the orifice is then sized at the actual fire-case relieving pressure of 121 percent of set, not at some assumed number. Near the critical point the latent heat collapses and the method with it; the studio flags that too.',
  },
  {
    id: 'drum',
    icon: CircleDot,
    title: 'The knockout drum',
    content:
      'A flare header must deliver gas, not slugs of liquid, to the tip. The drum works if a droplet of the stated size falls across the vapor space before the gas carries it out the far end. The settling velocity comes from the API 521 drag-coefficient method with the coefficient iterated against the Reynolds number, and the answer is presented as the length each candidate diameter demands, with the length-to-diameter ratio as the judgment: above six, go wider.',
  },
  {
    id: 'radiation',
    icon: Sun,
    title: 'Flare radiation',
    content:
      'The API 521 point-source model, asked both ways: what intensity lands at a stated distance, and what distance a stated allowable demands. The second answer is what a stack height or a sterile radius actually buys. The customary allowable levels are offered with their exposure meanings. The model ignores flame length and wind tilt, so treat it as screening: right for a first stack height, not for detail design near the limits.',
  },
  {
    id: 'blowdown',
    icon: Timer,
    title: 'Blowdown',
    content:
      'An adiabatic march of a vessel discharging through a fixed orifice in critical flow: pressure and temperature against time, with the customary 15-minute marker drawn on the curve so the API 521 depressuring question is read rather than asserted. The adiabatic assumption is the cold bound; a real vessel picks up heat from its own steel and chills less, but the low-temperature metallurgy question starts from this curve.',
  },
  {
    id: 'honesty',
    icon: AlertTriangle,
    title: 'What is typed rather than computed',
    content:
      'The balanced-bellows factors Kb and Kw, the steam superheat factor KSH, and the fire environment factor for insulation credit are published as charts and tables in API 520 and 521. This studio does not reproduce plotted curves from memory: those factors are inputs with their references named, defaulting to the values the standard gives for the simple case, and the studio warns where the simple default stops being safe.',
  },
];

const ReliefHelpContent = () => (
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

export default ReliefHelpContent;
