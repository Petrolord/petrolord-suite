// Pipeline & Line Sizing Studio help content (Facilities F1).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Ruler, Wind, Waves, Mountain, Shield, CircleDot, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It sizes a single surface line: liquid, gas or multiphase. You state the fluid, the duty and the route, and it answers with the pressure drop of the size you picked, and then with the same line evaluated at every pipe size in the schedule table, so choosing a diameter is reading a table with limits marked rather than trusting one number. It is deliberately a single-line tool: solving a whole gathering network, where the wells and the lines set each other\'s pressures, is the Production Network Studio\'s job.',
  },
  {
    id: 'liquid',
    icon: Ruler,
    title: 'Liquid lines',
    content:
      'Darcy-Weisbach with the Colebrook-White friction factor, the same physics every hydraulics reference publishes. The drop is reported split into friction, fittings and elevation because they answer different questions: friction is what a bigger pipe fixes, and elevation is what no pipe fixes. Rates are taken at line conditions, which is the dead-liquid case downstream of separation; a live-oil line upstream of separation belongs in the Production module\'s Flow Assurance Studio, which carries full PVT.',
  },
  {
    id: 'gas',
    icon: Wind,
    title: 'Gas lines and choosing an equation',
    content:
      'Weymouth, Panhandle A, Panhandle B and the General Flow equation, in their published forms with the standard elevation adjustment. They are different empirical fits, not one truth: Weymouth is conservative and suits short high-pressure gathering lines, the Panhandle pair were fitted to long transmission lines and flatter short ones, and the General Flow equation computes friction explicitly from Colebrook instead of baking it into the exponent. The efficiency factor E is where line condition lives; a clean new line runs near 1.0 and an old wet one nearer 0.85. The z-factor can come from the validated Dranchuk-Abou-Kassem correlation at your conditions or be typed directly.',
  },
  {
    id: 'multiphase',
    icon: Waves,
    title: 'Multiphase lines',
    content:
      'The Beggs and Brill correlation, the same golden-tested implementation the Nodal Analysis Studio runs, applied at the line\'s own inclination. Alongside the pressure drop it reports the flow pattern and the liquid holdup, and both matter: an intermittent pattern is a slugging warning for the receiving vessel, and the holdup is exactly the liquid a pig will push ahead of itself, which is why the Pigging tab can read it directly.',
  },
  {
    id: 'erosional',
    icon: AlertTriangle,
    title: 'The erosional limit',
    content:
      'API RP 14E limits velocity to C over the square root of the mixture density. C is an input, not a constant, because RP 14E itself says its published values are conservative and allows higher where the fluid is clean and corrosion is controlled. Continuous service is customarily 100, intermittent 125, and clean inhibited service higher still. Every sizing table row carries its own erosional check.',
  },
  {
    id: 'profile',
    icon: Mountain,
    title: 'The elevation profile',
    content:
      'A line over hills is not the flat line with the same endpoints: the gradient changes with every inclination, and on a multiphase line the holdup changes with it. The Profile tab marches the line segment by segment in the physics of the active service and draws the pressure against distance, so a pinch in the middle of the route shows up where it is instead of vanishing into an average.',
  },
  {
    id: 'wall',
    icon: Shield,
    title: 'Wall thickness and MAOP',
    content:
      'Barlow\'s formula under the design factors of the code you name: B31.4 for liquid lines at a flat 0.72, and B31.8 for gas lines with its location classes, which derate the allowable stress as more people live near the line. The corrosion allowance is added on top of the pressure wall. The same equation read the other way gives the maximum allowable operating pressure of the wall you actually have, net of that allowance.',
  },
  {
    id: 'pigging',
    icon: CircleDot,
    title: 'Pigging',
    content:
      'Three honest numbers: how much liquid a sphere sweeps ahead of itself, which is the line volume times the holdup it runs through; how long the run takes at the stated pig speed; and how often you must pig so the accumulation between runs plus the sweep still fits inside the slug catcher. Feed the holdup from the Multiphase tab and the estimate is only as wrong as Beggs and Brill; type one and it is only as honest as your guess.',
  },
];

const LineSizingHelpContent = () => (
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

export default LineSizingHelpContent;
