// Produced Water Treatment Studio help content (Facilities F7).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Droplets, Thermometer, Filter, Layers, TrendingDown, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Designs and checks a produced water treatment train against a discharge specification. You give it the water, the droplet character and the equipment, and it tells you what leaves the train, which stage does the work, and why the spec is or is not met. It is a screening tool for sizing and troubleshooting. A vendor performance guarantee on a specific piece of equipment is a separate thing, and this studio does not replace one.',
  },
  {
    id: 'droplets',
    icon: Droplets,
    title: 'Oil in water is a distribution',
    content:
      'A concentration in parts per million tells you how much oil is there. How hard it is to remove is a different question, and the answer is in the droplet sizes. Two streams at five hundred ppm behave completely differently if one carries its oil as hundred-micron droplets and the other as ten-micron ones. So the studio works from a droplet size distribution, taken as log-normal with a median and a spread, and every device is described by the size it cuts at rather than by a fixed efficiency. This is the single biggest difference from a rule-of-thumb approach, and it is why the inlet median is the most important number on the input panel.',
  },
  {
    id: 'grade',
    icon: Filter,
    title: 'Cut size and grade efficiency',
    content:
      'No separator removes all droplets or none: it removes big ones well and small ones poorly, with a characteristic size where it catches half of what arrives. That is its cut size. The removal it actually achieves is the droplet distribution weighed against that curve, which means the same device performs differently on different water, exactly as it does in the field. A device datasheet quoting one efficiency figure is quoting its performance on the water it was tested with.',
  },
  {
    id: 'coupling',
    icon: TrendingDown,
    title: 'Why three good devices do not multiply',
    content:
      'Each device removes what it can catch and passes on what it cannot, so the water leaving it is finer than the water that entered. The next device therefore faces harder water than the first one did. Three devices that each remove ninety percent of their own inlet do not together remove 99.9 percent of the original, and a design based on multiplying nameplate efficiencies will be optimistic in a way that only shows up in commissioning. The stage table in this studio shows the median falling down the train, which is the mechanism.',
  },
  {
    id: 'temperature',
    icon: Thermometer,
    title: 'Where temperature and salinity come in',
    content:
      'Everything here runs on Stokes settling, and Stokes depends on the water viscosity and the density difference between oil and water. Hot water is far less viscous, so the same equipment cuts finer on a hot stream than a cold one. Brine is both more viscous and denser, and the density part cuts the driving force directly. When the density difference falls under about sixty kilograms per cubic metre, gravity separation becomes slow and unreliable, which is the classic heavy-oil-in-hot-brine disappointment, and the studio warns about it. Stokes settling is also creeping flow: where the cut droplet is large enough to settle at a Reynolds number above about one, the studio says so, because the cut size it reports there is optimistic.',
  },
  {
    id: 'devices',
    icon: Layers,
    title: 'What each device is doing',
    content:
      'A gravity basin and a plate pack are the same physics, with the plates multiplying the settling area, which is why a plate pack is so much smaller for the same cut. A hydrocyclone replaces gravity with a centrifugal field, and that field goes as the square of the flow through the liners, so a bank of liners starved of flow loses its cut fast: shut liners in rather than running them all half fed. Running them the other way, above about 1.3 times the design flow per liner, the inlet slot chokes, the field stops rising, and the shear at the inlet starts breaking the droplets finer, so the cut size degrades from there; past twice design the studio refuses to answer and tells you how many liners the flow needs. Flotation attaches droplets to rising bubbles by interception, so the gas rate, the bubble size and the residence time all move the cut, and finer bubbles carry more surface per unit of gas, which is the whole difference between dissolved and induced gas. A media or walnut shell filter captures through the depth of the bed, so the bed depth, the grain size and the loading rate all move its cut size.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this does not do',
    content:
      'It does not model chemistry: no coalescer aid, no reverse demulsifier, no polymer. It does not predict solids fouling, filter run length or backwash intervals. It does not know your inlet droplet distribution unless you measure it, and if you type a number you half remember, the answer inherits that uncertainty exactly. Three limits are worth stating plainly. Every device here removes DISPERSED oil, and produced water also carries dissolved and soluble oil that none of them touches, so there is a floor under any outlet the train reports and this studio does not know where it is. The horizontal velocity check on a gravity basin applies the fixed-velocity half of the API 421 rule only; the standard also limits the velocity against the design droplet rise velocity, and that half is not implemented here. And the shape and scale constants behind each device, including the flotation attachment efficiency, the filter coefficient and the field a hydrocyclone liner develops at its design flow, are this studio\'s own declared choices. None of them is a published measurement, and all of them are on the input panel so you can put your own vendor numbers in. The filter coefficient is also declared at one loading rate, 10 m/h, and the loading exponent is the only velocity dependence in that model, so under 1 m/h of loading the studio refuses to report a cut size at all and names the floor it refused against. What a bed really does far below its design rate needs bed data this studio does not carry. Where it earns its keep is in showing which lever actually moves the outlet, and that is usually upstream shear rather than another stage of equipment.',
  },
];

const PwtHelpContent = () => (
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

export default PwtHelpContent;
