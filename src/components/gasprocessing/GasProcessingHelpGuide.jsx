// Gas Processing Studio help content (Facilities F3).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Droplets, Beaker, Wind, Layers, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Three gas-conditioning units in one place: glycol dehydration, amine sweetening, and the dew-point question behind a pressure drop. The predecessor app hid its assumptions inside constants; this one turns every design choice into a visible input with its customary range named, and computes only what is honestly computable at screening level.',
  },
  {
    id: 'water',
    icon: Droplets,
    title: 'Water content',
    content:
      'The saturated water content comes from ideal vapor-liquid equilibrium over liquid water: the mole fraction of water is its vapor pressure over the total pressure. That is exact thermodynamics in the ideal-mixing limit and honest to a few percent at gathering pressures. The real-gas correction the McKetta-Wehe chart carries grows with pressure, reaching tens of percent past about 1500 psia, so above 1000 psia the studio says so and expects a chart reading for design work.',
  },
  {
    id: 'teg',
    icon: Beaker,
    title: 'TEG dehydration',
    content:
      'The water balance is arithmetic: removed water is inlet minus spec times the gas rate. The circulation RATIO is a design choice, customarily two to five gallons of TEG per pound of water, and it stays your choice. The reboiler duty is assembled from named parts: sensible heat to lift the glycol to reboiler temperature, the heat to boil the absorbed water overhead, and a stated reflux fraction, so you can see which part dominates instead of trusting one number. Stage-wise performance uses the Kremser relation with the absorption factor as an input, since the TEG-water equilibrium constant itself is chart data.',
  },
  {
    id: 'amine',
    icon: Wind,
    title: 'Amine sweetening',
    content:
      'A mole balance: acid gas picked up over the loading swing gives the amine moles, the solution strength gives the gallons. The customary strengths, rich-loading limits and reboiler duties for MEA, DEA and MDEA are offered as defaults, and exceeding the customary rich loading warns, because that is where corrosion lives. What a mole balance cannot answer, and this studio does not pretend to, is selectivity and approach to equilibrium; that is rate-based simulation territory.',
  },
  {
    id: 'jt',
    icon: Layers,
    title: 'Dew point and the JT drop',
    content:
      'The Joule-Thomson coefficient here is not the usual rule of thumb: it is derived from the same validated z-factor correlation the rest of the platform uses, differentiated with temperature. That it lands on the classic seven degrees per hundred psi for lean gas is the check, not the assumption. The march across the drop then gives the cold-spot temperature, and the water content the cold gas can still hold tells you what condenses there. Hydrate margin at that spot is the Flow Assurance Studio\'s question.',
  },
  {
    id: 'honesty',
    icon: AlertTriangle,
    title: 'What is typed rather than computed',
    content:
      'The TEG circulation ratio, the absorption factor, the contactor K value, the BTEX absorbed fraction, the amine duty factor and the rich-loading limit are design choices or chart values. They are inputs with their customary ranges beside them. The McKetta-Wehe chart and the TEG equilibrium charts stay armed literature gates: the studio will not read a plotted curve for you and get it silently wrong.',
  },
];

const GasProcessingHelpContent = () => (
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

export default GasProcessingHelpContent;
