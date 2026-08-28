// ESP Design Studio help content, rendered inside the StudioHelp sheet
// (Production P5).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, ArrowUpFromLine, Gauge, Wind, Zap, Activity, Stethoscope, Link2, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio designs',
    content:
      'An electrical submersible pump installation for one well: how much head the pump has to make, how many stages make it, what the stages do to the gas that arrives with the fluid, what motor turns them and what cable feeds it. The starting point is a well with more inflow than pressure, typically watered out, that cannot lift its own column. The design question is never "which pump" first; it is "how much head", and everything else follows from that number.',
  },
  {
    id: 'tdh',
    icon: ArrowUpFromLine,
    title: 'Total dynamic head',
    content:
      'The pump adds pressure. Total dynamic head is that pressure expressed in feet of the fluid the pump is moving: (discharge pressure less intake pressure) divided by the fluid gradient at the intake. Both pressures are computed here rather than assumed. The intake pressure is the flowing bottomhole pressure from the inflow relationship, less the annulus column standing between the perforations and the intake. The discharge pressure is a full multiphase traverse marched from the wellhead down to the pump at the design rate. The three-part reading on the Design tab (net lift, wellhead pressure, friction and gas lightening) is a decomposition of that head, arranged so its parts sum to the total exactly.',
  },
  {
    id: 'annulus',
    icon: Gauge,
    title: 'The annulus gradient, and why it is yours to set',
    content:
      'The column between the perforations and the intake carries whatever gas has broken out of the fluid, so it is lighter than the produced liquid. Using the liquid gradient there overstates the intake pressure, which understates the head, which undersizes the pump. There is no honest correlation for it in the general case, so it is an input: use the produced liquid gradient only when the well is making no free gas at intake conditions, and something lighter when it is.',
  },
  {
    id: 'gas',
    icon: Wind,
    title: 'Gas through the pump',
    content:
      'Free gas at the intake comes out of the black-oil PVT at the intake pressure and temperature: the produced gas-oil ratio less the gas still in solution there. What an intake separator removes is a vendor or measured efficiency, not a correlation, so it is typed in. What is left goes through the stages, and the gas volume fraction it represents is the number that decides the equipment: a standard stage below the first limit, a gas handler between the two, and above the second limit the gas has to come out ahead of the pump, or gas lift is the better method for this well. Both limits are ordinary operating guidance and both are editable. The gas the separator vents also leaves the tubing above the pump lighter, which the discharge traverse accounts for.',
  },
  {
    id: 'curve',
    icon: Activity,
    title: 'Where the stage curve comes from',
    content:
      'Two routes and no third one. Enter the vendor’s published curve points and the studio fits head, efficiency and brake power through them, reporting the fit residual so a bad transcription shows up. Or pick a reference model stage: a shape built from four named parameters, grouped by the housing sizes the industry standardised on. A reference stage is not any manufacturer’s pump, carries no part number, and is labelled as a model everywhere it appears. It exists so a sizing exercise has something physical to work with. The predecessor Artificial Lift Designer shipped invented curves under vendor-sounding model names, which is exactly what is refused here. Drive frequency is handled by the affinity laws for a fixed impeller: rate with speed, head with speed squared, power with speed cubed, efficiency unchanged. Viscous service moves all three off the water curve; the Hydraulic Institute correction is not reproduced from memory, so the in-situ viscosity is reported and a correction is flagged as required rather than invented.',
  },
  {
    id: 'system',
    icon: Activity,
    title: 'Pump against system',
    content:
      'A stage count is always rounded up, so the stack makes slightly more head than the design rate demands, and it therefore runs slightly faster than the design rate. The system curve is the head the well demands at each rate; the pump curve is the head the stack makes; a fixed installation runs where they cross. Every point on the system curve costs an inflow lookup and a full traverse, and the crossing is solved on top of them, so this is an explicit run rather than a live recompute, and it is marked stale as soon as an input changes. When the two curves do not cross inside the rate range, that is reported as the real answer it is: the stack is too small or too large for this well.',
  },
  {
    id: 'electrical',
    icon: Zap,
    title: 'Motor and cable',
    content:
      'Current at part load is the nameplate scaled by the shaft load, which is the honest way to get it from a nameplate; below about half load the real current flattens toward the magnetising current and the estimate is flagged rather than extrapolated to zero. Cable resistance is the published copper conductor value with the standard temperature correction at the average cable temperature, and the three-phase drop is the usual root-three form. Ampacity is not assumed: it belongs to the insulation system and the well temperature, so it is a manufacturer number. The candidate table shows every conductor and why each passed or failed, and when none of them both carries the current and stays inside the drop limit the studio says so instead of returning the least bad one.',
  },
  {
    id: 'diagnostics',
    icon: Stethoscope,
    title: 'Diagnostics',
    content:
      'The same curve, read backwards, from what a surveillance record actually holds: rate, intake and discharge pressure, frequency and motor amps. The head the installation is making is compared with the head its curve says it should make at that rate and speed. A stack at 80 percent of its curve is worn, gas locked or running on a stage count that is not what the paperwork says, and the ratio says so without guessing which. Running amps against nameplate and the position relative to the best efficiency point complete the picture. This is the ESP Performance Monitor tile, absorbed here so the diagnosis is read against the same curve the design was sized on.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'The production spine, and saving',
    content:
      'Linking a design to a field and a well on the production spine is optional and changes no arithmetic: it stores ids, and it lets the latest valid well test fill the design rate, water cut, wellhead pressure and gas-oil ratio rather than having them retyped. Designs themselves save to your own account; the production data stays in the org-scoped spine tables and is never copied into a design row. Old Artificial Lift Designer saves can be imported for their well and duty numbers; the pump model name is deliberately not carried across.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What the studio refuses to do',
    content:
      'A duty off the end of the pump curve produces no stage count rather than a negative one. A well whose inflow already delivers more pressure than the tubing needs is reported as naturally flowing at that rate, not handed a pump. A design rate at or above the absolute open flow of the inflow relationship is refused with the open-flow number rather than solved to nonsense. A cable that cannot meet the drop limit is reported as no cable, not as the closest conductor. Each of these is a real engineering answer, and each is more useful than a number that looks like an answer.',
  },
];

const EspHelpContent = () => (
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

export default EspHelpContent;
