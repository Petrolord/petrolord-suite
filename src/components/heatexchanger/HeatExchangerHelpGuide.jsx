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
    title: 'Where the F correction comes from',
    content:
      'A shell-and-tube exchanger is not pure counter-current, so the log-mean driving force is multiplied by a correction factor F that depends on the two dimensionless groups P and R. F is published as a chart, and it is also published as a closed-form equation; this studio computes it from the equation. The predecessor app made you type an Ft, which puts a chart reading in the middle of the calculation that sets the area. Below F of about 0.8 the curve is steep, small errors in the terminal temperatures swing the area badly, and the standards say to add a shell pass instead. Shells in series are a whole number here: the studio refuses a fraction rather than rounding one silently, because the F either side of a fraction differs by several percent. When a duty is beyond what the stated shells can reach at all, the studio says so rather than inventing a number.',
  },
  {
    id: 'u',
    icon: Layers,
    title: 'U, assembled rather than assumed',
    content:
      'The overall coefficient is built from its parts: the two film coefficients, the tube wall, and the two fouling allowances, all referred to the outside tube area. All five are printed with their share of the total, and the studio names the largest along with how far ahead of the runner-up it is, because a one-word verdict decided by a two percent gap is not a result to act on. The tube-side film can be computed from Dittus-Boelter with the Sieder-Tate viscosity correction, in its heating form, and the tube side here is the cold stream; the shell side stays an input, since a rigorous shell-side coefficient needs stream analysis that belongs in a dedicated rating package. The film needs a tube count and the tube count needs the area the film helped set, so the studio iterates the two to one count and shows the trail.',
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
      'The Rating tab asks the reverse question: given the exchanger you have, what does it actually do on these streams. That is the effectiveness-NTU form, and the studio carries the closed forms for counter-current, parallel and the 1-2 shell arrangement. Parallel flow and the 1-2 shell each have a hard ceiling on effectiveness that no amount of area beats, and the studio prints the ceiling beside the answer. Counter-current flow has no such ceiling: its effectiveness approaches 100 percent as the area grows, and the studio says so rather than implying a limit it does not have.',
  },
  {
    id: 'air',
    icon: Fan,
    title: 'Air coolers and the hot day',
    content:
      'An air cooler is sized on a design ambient it will exceed some days of the year. The studio RATES the hot day rather than scaling it: the bundle and the fans do not change, so the surface and the air mass are what stay fixed, and holding those fixes the effectiveness. The duty then follows from the inlet temperature difference, and the process leaves warmer and the air rises less than at the design point, so the studio reports the new outlet and the new air rise beside the duty. Fan power comes from the air the duty needs at the density of the air the FAN actually handles, which is ambient air in a forced-draft bay and heated air in an induced-draft one, so the studio asks which and asks for the barometric pressure too.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this studio does not claim',
    content:
      'Six things here are stated limits rather than validated numbers, because no publication behind this studio settles them, and none of them is papered over with an invented source. The bundle constants come from a table whose source is not recorded, and the 45 and 90 degree rows carried here are identical, so the layout box changes nothing between those two; 30 degrees does move the bundle. The validity band of the Dittus-Boelter fit is not established here, so the Reynolds and Prandtl numbers are printed for you to check against the source you trust. Only the heating form of that fit is carried, so a cooled tube side is refused rather than answered with the wrong exponent. The Sieder-Tate exponent has the same status. The air cooler is a cross-flow machine and the F for cross flow is not carried, so its area is a counter-current-basis area and a real bay needs more surface; the hot-day rating does not depend on that, because it holds effectiveness rather than assuming an arrangement. And the wall conductivity default of 26 names no material, while the three fan and motor defaults name no machine.',
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
