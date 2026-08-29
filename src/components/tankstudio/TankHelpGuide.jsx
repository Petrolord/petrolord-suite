// Storage Tank & Venting Designer help content (Facilities F12).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Layers, Wind, Flame, Droplets, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Three questions about an atmospheric storage tank that are usually asked separately and answered inconsistently, put in one place because they share a geometry: how thick each shell course has to be, how much the tank has to breathe in and out both normally and in a fire, and how much product evaporates out of it in a year.',
  },
  {
    id: 'shell',
    icon: Layers,
    title: 'Shell courses, and why the water test matters',
    content:
      'The one-foot method sizes each course for the head one foot above its own bottom, which is why courses thin as they go up until the minimum plate thickness takes over. The part people forget is that the tank is hydrostatically tested with water, and water is heavier than most products. On a light product the test case governs the shell, and designing for the product alone would under-thickness it. This studio computes both cases for every course and names which one governs.',
  },
  {
    id: 'venting',
    icon: Wind,
    title: 'Venting is what actually destroys tanks',
    content:
      'A large atmospheric tank is a thin-walled vessel designed for a few inches of water column. It has to breathe out when it is filled or warmed and breathe in when it is emptied or cooled, and the inbreathing case is the dangerous one: a cold rainstorm falling on a hot tank that is being drawn down will collapse it if the vacuum vent cannot pass air in fast enough. The studio computes both directions from the thermal and liquid-movement components, and names which governs, rather than sizing for pressure and assuming vacuum follows.',
  },
  {
    id: 'fire',
    icon: Flame,
    title: 'The fire case',
    content:
      'A tank engulfed in a pool fire boils its contents, and the vapour has to go somewhere. The emergency requirement is normally an order of magnitude above the normal venting rate, which is why an emergency vent or a frangible roof-to-shell seam exists at all. Only the wetted shell below thirty feet counts, because that is the basis the standard is written on.',
  },
  {
    id: 'losses',
    icon: Droplets,
    title: 'Losses are money and emissions at once',
    content:
      'Standing loss is the tank breathing daily whether or not anyone uses it, driven by the vapour space, the true vapour pressure and the temperature swing. Working loss is the vapour pushed out each time the tank is filled. The same arithmetic answers the money question and the emissions one, and control equipment is quantified by the efficiency you give it: an internal floating roof customarily saves sixty to ninety percent and a vapour recovery unit ninety to ninety-eight. Those are equipment and operating figures, so they are typed here rather than assumed.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this does not do',
    content:
      'No wind or seismic design, no roof structure, no foundation or settlement, no nozzle or shell-opening reinforcement, no floating roof mechanics. Those are the rest of API 650 and they need a tank designer. This gives you the shell thickness, the venting requirement and the loss estimate that a specification should carry, and the reasons behind each.',
  },
];

const TankHelpContent = () => (
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

export default TankHelpContent;
