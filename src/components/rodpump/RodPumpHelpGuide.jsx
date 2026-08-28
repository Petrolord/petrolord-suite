// Rod Pump Design Studio help content, rendered inside the StudioHelp
// sheet (Production P6).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Waves, Ruler, Gauge, Activity, Stethoscope, Link2, AlertTriangle, Wrench,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio designs',
    content:
      'A complete sucker-rod installation for one well: how deep the pump goes, what plunger it runs, what rod string hangs from the surface unit, how fast to pump it, and what the well makes for all that. The starting point is a well with more inflow than pressure, usually shallow and watered out, that cannot lift its own column. Everything downstream of that is a consequence of one question: how much of the surface stroke actually reaches the plunger.',
  },
  {
    id: 'wave',
    icon: Waves,
    title: 'Why this solves the wave equation',
    content:
      'A rod string is a long elastic bar, and what happens in it is governed by the damped wave equation. API RP 11L predicts plunger stroke, loads and torque from a set of dimensionless charts, and those charts ARE solutions of that equation, computed once and plotted. Reproducing plotted curves from memory is something this platform refuses to do, and here there is no need to: the equation is first-principles physics, so it is solved directly. The RP 11L dimensionless groups are still reported on the Design tab, because they are how a rod-pump engineer reads an answer; the published charts remain a validation gate for when the document is to hand. One consequence worth knowing: pumped slowly, the solution reduces exactly to the spring answer, where the plunger loses precisely the rod stretch. That reduction is the strongest gate on the whole engine.',
  },
  {
    id: 'stroke',
    icon: Ruler,
    title: 'Plunger stroke, and where the rest of it went',
    content:
      'At the bottom of the stroke the traveling valve shuts and the plunger stays exactly where it is while the polished rod moves up and the rod string stretches. Only when the tension just above the plunger has built to the full fluid load does the plunger begin to lift. The same thing happens in reverse at the top. Those two held periods are the vertical sides of the downhole card, and they are why the plunger stroke is shorter than the surface stroke. Pump faster and the string starts to behave dynamically rather than as a spring: the plunger can overtravel and beat the surface stroke, which is free production, but the loads and the torque climb faster than the production does.',
  },
  {
    id: 'fillage',
    icon: Gauge,
    title: 'Fillage, submergence and gas',
    content:
      'Free gas at intake conditions competes with liquid for the barrel, and what wins is decided by the black-oil PVT at the intake pressure, not by a rule of thumb. What a gas anchor removes goes up the annulus and is a vendor or measured efficiency you type in; what is left occupies barrel volume liquid would have had, and that is the fillage. Submergence, the feet of fluid standing over the pump, comes off the inflow relationship: pump harder and the fluid level falls, which is why the studio computes it rather than asking for it. A barrel that fills only partly means the load stays on the rods into the downstroke and then drops away sharply, which is fluid pound, and here it falls out of the fillage rather than being a card shape drawn to look like one.',
  },
  {
    id: 'unit',
    icon: Wrench,
    title: 'The surface unit',
    content:
      'A conventional unit is a four-bar linkage and it is solved as one, exactly. It is not a sine wave: the crank turns at constant speed but the beam does not, so the upstroke and the downstroke take different amounts of the revolution, and that asymmetry is most of the difference between a real peak torque and a textbook one. The torque factor is ds/dtheta, which is what virtual work says a torque factor is, so it is differentiated from the linkage rather than quoted from a formula. There are no named pumping units here with dimensions behind them: real beam dimensions are manufacturer data and differ between makers for the same API designation, so the studio offers a generic linkage scaled to your stroke and says it is generic. For a real design, type the dimensions off the unit drawing.',
  },
  {
    id: 'balance',
    icon: Activity,
    title: 'Counterbalance and torque',
    content:
      'Without counterweights the gearbox sees a huge torque on the upstroke and much less on the downstroke. Balancing means choosing the crank counterweight moment so the two peaks are equal, and that is one condition in one unknown, so it is solved rather than estimated. The counterweights are hung so they are at the top of their travel when the rods are at the bottom of theirs: they then fall through the upstroke, which is when the gearbox needs the help. The counterbalance effect quoted is the polished rod load the weights hold up, read at the quarter turn where their moment is greatest.',
  },
  {
    id: 'rods',
    icon: Ruler,
    title: 'The rod string',
    content:
      'Sizes are read as the fractions they are: 7/8 is seven eighths of an inch. Section areas are computed from diameters rather than tabled, and the published API weights are checked against bare steel plus a consistent coupling allowance, so a transcription slip shows up. Buoyancy is Archimedes and nothing else. A taper carries its heaviest rods at the top where the load is, and it is designed so every section runs at the same fraction of its allowable; the studio can propose those lengths. The allowable itself is the modified Goodman line, which rises with the minimum stress a section sees, multiplied by a service factor that stands for the fluid, the corrosion and your own practice, and so has no default that could stand in for knowing it.',
  },
  {
    id: 'diagnostics',
    icon: Stethoscope,
    title: 'Reading a measured card',
    content:
      'The Diagnostics tab solves the same wave equation in the other direction. A surface dynamometer card gives both the position and the load at the top of the string, and each Fourier harmonic of that card is carried down to the pump in closed form. This is the Gibbs solution, and it is a completely separate solver from the one that predicts a design, which is why loading a predicted card and diagnosing it is a real check rather than a restatement. Nothing here names the fault: the downhole card shape is the diagnosis, and an engineer reads it. What the studio reports is the plunger stroke that actually reached the pump, the fluid load taken off the flat parts of the card, and the share of the cycle the pump carried load.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'The production spine, and saving',
    content:
      'Linking a design to a field and a well on the production spine is optional and changes no arithmetic: it stores ids, and it lets the latest valid well test fill the design rate, water cut, wellhead pressure and gas-oil ratio rather than having them retyped. Designs save to your own account; the production data stays in the org-scoped spine tables and is never copied into a design row. Old Artificial Lift Designer saves can be imported for their well and duty numbers, but not for their rod strings.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What the studio refuses to do',
    content:
      'A rod string that does not reach its pump is refused, not stretched to fit. A rod size it cannot read is refused rather than given a plausible diameter, because that is exactly how the predecessor turned a 7/8 rod into a 7.8 inch one. A design rate at or above the inflow’s absolute open flow is refused with the open-flow number. A unit driven at or above the rod string’s own natural frequency is refused, because nothing predicted past resonance would be trustworthy. A linkage whose dimensions cannot close is reported rather than clamped into something that closes. And a string with no damping is refused outright: with none it never settles into a repeating stroke, and the loads it would report look perfectly stable and mean nothing.',
  },
];

const RodPumpHelpContent = () => (
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

export default RodPumpHelpContent;
