// Control Valve & Choke Sizing help content (Facilities F11).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Waves, Droplets, Wind, Sliders, Volume2, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Sizes a control valve to the ISA 75.01 method at three flows rather than one, and checks the things that decide whether the valve will actually control: how much of the system drop it takes, where it sits on its own travel at each flow, whether the service chokes, cavitates or flashes, and whether the outlet velocity is going to erode the body. It gives you the Cv a vendor should be quoting against and the reasons behind it, not a substitute for their trim selection.',
  },
  {
    id: 'choking',
    icon: Waves,
    title: 'Why the choking boundary comes first',
    content:
      'A control valve is the one item of process equipment where the ordinary sizing equation stops working exactly when the service gets difficult. Past a certain pressure drop the flow chokes: the vena contracta reaches the vapour pressure on liquid or sonic velocity on gas, and further drop across the valve produces no further flow at all. Size on the full stated drop past that point and you will undersize the valve badly, because the equation credits you with a pressure drop the valve cannot use. This studio finds the boundary first, tells you which side of it each flow case sits on, and uses the allowable drop when the service is choked.',
  },
  {
    id: 'cavitation',
    icon: Droplets,
    title: 'Cavitation is not flashing, and damage starts early',
    content:
      'Two different things happen when a liquid drops below its vapour pressure inside a valve. If it recovers above the vapour pressure downstream, the bubbles collapse: that is cavitation, and the implosions destroy trim. If the downstream pressure stays below the vapour pressure, the bubbles do not collapse: that is flashing, the flow is two-phase from the valve onwards, and an anti-cavitation trim will do nothing for it because there is no collapse to prevent. The two need different valves and this studio distinguishes them. It also reports the cavitation index, because damage begins well before the flow chokes and a valve can be quietly eroding at a duty that looks perfectly stable on a Cv calculation.',
  },
  {
    id: 'gas',
    icon: Wind,
    title: 'Gas, the expansion factor and the terminal ratio',
    content:
      'Compressible flow through a valve expands as it drops, so the sizing equation carries an expansion factor that falls as the pressure-drop ratio rises. It falls linearly to exactly two thirds and then stops, which is the choked condition: the flow is sonic in the vena contracta and the valve cannot pass more whatever you do downstream. The terminal ratio at which that happens depends on the valve style, which is why a butterfly valve chokes far earlier than a cage-guided globe.',
  },
  {
    id: 'authority',
    icon: Sliders,
    title: 'Authority, and the failure a Cv number never shows',
    content:
      'Valve authority is the fraction of the system drop the valve takes at design flow, and it decides whether the loop can control at all. With low authority the system absorbs most of the drop as flow rises, which flattens the installed characteristic so severely that the valve does nearly all its work in the first few percent of travel. Equal-percentage trim exists precisely to cancel that distortion, which is why the recommended characteristic follows from the authority rather than from preference. Separately, a valve sized only for the maximum flow can sit almost on its seat at turndown, where the characteristic collapses entirely; sizing at three flows is what makes that visible.',
  },
  {
    id: 'noise',
    icon: Volume2,
    title: 'Noise, honestly',
    content:
      'A real aerodynamic noise prediction needs the full IEC 60534-8-3 method with valve and pipe geometry this tool does not have. What is offered instead is a screening indication banded on the pressure ratio and the stream power, and it is labelled as exactly that. Use it to know whether the question needs asking, not to answer it. Past a pressure ratio of about four, expect to need multistage trim, a diffuser, heavier pipe wall or acoustic insulation, and expect a specialist to size them.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What is table data here',
    content:
      'The pressure recovery factor and the terminal pressure-drop ratio by valve style are published table values, and this studio treats them as such: they are offered as defaults with the style named, and a vendor number for a specific trim always wins. Piping geometry factors are inputs rather than computed, because they depend on the reducers actually installed. Nothing here should override a vendor sizing sheet; it should tell you whether to believe one.',
  },
];

const ValveHelpContent = () => (
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

export default ValveHelpContent;
