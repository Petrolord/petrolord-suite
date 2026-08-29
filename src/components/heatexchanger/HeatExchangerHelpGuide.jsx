// Heat Exchanger & Cooling Studio help content (Facilities F4).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Thermometer, Sigma, Layers, Fan, Gauge, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Thermal design and rating for shell-and-tube exchangers and air coolers, at the level a facilities engineer works before handing a datasheet to a vendor or a rigorous rating package. It sizes the surface a duty needs, rates the duty an existing exchanger delivers, and sizes an air cooler including the hot-day capacity that actually limits the plant.',
  },
  {
    id: 'balance',
    icon: Thermometer,
    title: 'The energy balance comes first',
    content:
      'Give three of the four terminal temperatures, or a duty and the two inlets, and the fourth follows from the balance. The studio refuses a duty that crosses the streams rather than passing a negative driving force downstream and returning an area that looks plausible. If the hot outlet would fall below the cold inlet, no exchanger of any size does that, and saying so is more useful than a number.',
  },
  {
    id: 'f',
    icon: Sigma,
    title: 'The F correction is computed, not typed',
    content:
      'A shell-and-tube exchanger is not pure counter-current, so the log-mean driving force is multiplied by a correction factor F that depends on the two dimensionless groups P and R. F is published as a chart, but it is also published as a closed-form equation, and this studio computes it. That matters: the predecessor made you type an Ft, and a mis-read chart is exactly where a design quietly goes wrong by twenty percent. Below F of about 0.8 the curve is steep, small errors in the terminal temperatures swing the area badly, and the standards say to add a shell pass instead. When a duty is beyond what the stated shells can reach at all, the studio says so rather than inventing a number.',
  },
  {
    id: 'u',
    icon: Layers,
    title: 'U, assembled rather than assumed',
    content:
      'The overall coefficient is built from its parts: the two film coefficients, the tube wall, and the two fouling allowances, all referred to the outside area. The studio names the controlling resistance, because that is where extra surface buys the least and where a design change buys the most. The tube-side film can be computed from Dittus-Boelter with the Sieder-Tate viscosity correction; the shell side stays an input, since a rigorous shell-side coefficient needs stream analysis that belongs in a dedicated rating package.',
  },
  {
    id: 'transition',
    icon: AlertTriangle,
    title: 'Where the studio refuses to answer',
    content:
      'Between Reynolds 2300 and 10000 the tube-side flow is neither properly laminar nor properly turbulent, and no film correlation there is trustworthy. The studio refuses that band rather than interpolating across it, and tells you to change the tube count, the passes or the bore to leave it. A number produced there would look like an answer and behave like a guess.',
  },
  {
    id: 'rating',
    icon: Gauge,
    title: 'Rating with effectiveness-NTU',
    content:
      'The Rating tab asks the reverse question: given the exchanger you have, what does it actually do on these streams. That is the effectiveness-NTU form, and the studio carries the closed forms for counter-current, parallel and the 1-2 shell arrangement. Each arrangement has a hard ceiling on effectiveness that no amount of area beats, and when a target is past that ceiling the studio names the ceiling instead of returning a huge NTU.',
  },
  {
    id: 'air',
    icon: Fan,
    title: 'Air coolers and the hot day',
    content:
      'An air cooler is sized on a design ambient it will exceed some days of the year, and its capacity falls with the approach it loses. The studio reports the summer capacity beside the design capacity for an ambient you name, because that is the number that limits the plant in August and the reason air coolers are chosen on the hot day rather than the average one. Fan power comes from the air the duty actually needs at the density of the air at that temperature, with the shaft and motor powers reported separately.',
  },
];

const HeatExchangerHelpContent = () => (
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

export default HeatExchangerHelpContent;
