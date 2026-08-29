// Corrosion & Integrity Studio help content (Facilities F6).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Waves, Thermometer, ShieldCheck, Droplets, Timer, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Screens CO2 corrosion of carbon steel at line conditions, checks whether the service is sour under MR0175, and turns the rate into a remaining life against a corrosion allowance. It is a screening model, not a prediction: it tells you which lines need attention and roughly how much, and where the uncertainty is large enough that an inhibitor programme or a metallurgy decision needs real data behind it.',
  },
  {
    id: 'velocity',
    icon: Waves,
    title: 'Why velocity is in the model at all',
    content:
      'CO2 corrosion is fed by mass transfer: the carbonic acid has to reach the wall and the iron has to leave it. So the rate is two resistances in series, the chemical reaction and the transport, and the slower one governs. That is why the same fluid in a bigger line corrodes less at the same rate, and why a velocity sweep saturates rather than rising forever. A model with only a flat multiplier cannot say either of those things, and the Rate against velocity chart is the difference.',
  },
  {
    id: 'temperature',
    icon: Thermometer,
    title: 'Hotter is not always worse',
    content:
      'Below about 60 degrees Celsius the rate rises with temperature the way an Arrhenius law says. Above it, iron carbonate becomes protective, plates out on the steel and the rate falls with further heating. The studio applies the published scale factor for that, which is why a hot line can screen better than a warm one. Extrapolating the low-temperature equation upward without it is a common and expensive mistake.',
  },
  {
    id: 'inhibitor',
    icon: ShieldCheck,
    title: 'Efficiency is not availability',
    content:
      'An inhibitor datasheet quotes an efficiency, typically ninety-something percent. What eats the wall is the time average, and the uninhibited rate applies for every hour the inhibitor is not on spec, not injecting, or being displaced by a slug. A 95 percent inhibitor at 80 percent availability delivers 76 percent protection, which is nearly five times the metal loss of the number on the datasheet. The studio asks for both and shows the effective figure, because that gap is where corrosion failures live.',
  },
  {
    id: 'shear',
    icon: Droplets,
    title: 'Wall shear and whether the film survives',
    content:
      'An inhibitor works by holding a film on the steel, and the film has to survive the shear of the flow. Above roughly 100 pascals of wall shear most films are stripped, so the efficiency on the datasheet stops describing the line. The studio computes the shear from the flow and flags it, because a high-shear line with an excellent inhibitor is not a protected line.',
  },
  {
    id: 'sour',
    icon: AlertTriangle,
    title: 'Sour service and which film governs',
    content:
      'MR0175 draws its severity regions from the H2S partial pressure AND the in-situ pH, not from H2S alone, because a low pH makes a modest H2S far more dangerous. The studio places the case in a region and says what that means for material qualification. Separately it reports the H2S to CO2 ratio: past about one to five hundred, iron sulphide governs the surface instead of iron carbonate, and a CO2 rate model has stopped describing what is happening. When that is the case the studio says so rather than quoting a number with false confidence.',
  },
  {
    id: 'life',
    icon: Timer,
    title: 'Allowance, life, and what to fix',
    content:
      'The rate becomes useful when it is divided into a corrosion allowance. The studio reports the remaining life against the rate the mitigation actually delivers, the allowance a stated design life would need, and the shortfall if there is one. The practical value is in the comparison: when it is the inhibitor availability failing the design life rather than the chemistry, fixing the injection system is far cheaper than upgrading the metallurgy, and the studio makes that visible.',
  },
];

const CorrosionHelpContent = () => (
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

export default CorrosionHelpContent;
