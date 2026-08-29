// Compressor Station Designer help content (Facilities F9).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Layers, Thermometer, Gauge, Wind, Flame, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Sizes a gas compression station to the GPSA Chapter 13 method: how many stages the duty needs, how much power each takes, how hot each discharge runs, how much interstage cooling that implies, whether the duty suits a reciprocating or a centrifugal machine, and what the driver will burn. It is a sizing and screening tool, not a substitute for a vendor performance run on a specific frame.',
  },
  {
    id: 'staging',
    icon: Layers,
    title: 'What really sets the stage count',
    content:
      'Two limits apply and the larger wins. The first is the ratio a single stage can take, customarily about four. The second is the discharge temperature, and on a hot suction or a high heat-capacity-ratio gas it is almost always the binding one. The studio reports which limit governed, because they respond to different fixes: a ratio-governed machine wants another stage, while a temperature-governed one may only want colder suction or better intercooling. Sizing on the ratio rule alone under-stages exactly the cases that matter, and the machine ends up running its valves and lube oil above where they last.',
  },
  {
    id: 'polytropic',
    icon: Gauge,
    title: 'Polytropic is not isentropic',
    content:
      'A real compressor generates heat as it works, and that heat has to be recompressed by the rest of the machine. The polytropic exponent carries the efficiency inside it, which is why it is larger than the isentropic exponent and why the discharge runs hotter than an isentropic calculation suggests. Using one exponent where the other belongs is the classic error in this calculation and it is worth roughly ten percent of the power. The studio shows both heads and both efficiencies side by side, and they give the same shaft power, because the actual work is the actual work whichever path you reference it to.',
  },
  {
    id: 'z',
    icon: Thermometer,
    title: 'Compressibility across a stage',
    content:
      'The gas is not ideal, and its compressibility changes materially between suction and discharge at pipeline pressures. The studio evaluates Z at both ends from the validated correlation and averages them, rather than taking the suction value and carrying it through, which overstates the head.',
  },
  {
    id: 'cooling',
    icon: Wind,
    title: 'Intercooling and what it costs',
    content:
      'Cooling between stages is what makes multi-stage compression worth the extra machinery: colder suction to the next stage means less work for the same ratio. The studio reports the cooling duty at every stage, because that is a real exchanger with a real cost, and the trade is genuinely between shaft power and heat-exchange surface. The power sweep shows the other half of it: power rises smoothly with discharge pressure while the stage count rises in steps, so the cheap discharge pressure is the one just below a step rather than just above it.',
  },
  {
    id: 'machine',
    icon: Flame,
    title: 'Reciprocating or centrifugal, and the fuel',
    content:
      'The screen uses the published selection criteria only: the actual inlet volume, the pressure ratio and the power. Centrifugals want volume and dislike high ratios per wheel; reciprocating machines take ratio easily and dislike large volumes. Where both are viable the studio says so rather than inventing a preference, because availability, footprint, maintenance philosophy and what the site already runs decide it. Driver fuel matters separately: on a gas plant it comes out of the very stream being compressed, so it belongs in the sales-gas balance and not just the utilities line.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this does not do',
    content:
      'No machine curves, no surge line, no wheel selection, no valve dynamics or rod loading. Those need vendor data for a specific frame, and a screening tool that pretended to them would be worse than useless. What this gives you is the duty a vendor should be quoting against, the stage count and power to expect, and the reasons behind both.',
  },
];

const CompressorHelpContent = () => (
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

export default CompressorHelpContent;
