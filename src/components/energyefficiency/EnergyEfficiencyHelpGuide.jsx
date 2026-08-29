// Energy & Utilities Efficiency Studio help guide (DS8).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Flame, Scale, AlertTriangle, Droplets, Gauge, GitMerge, Leaf, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It finds energy a plant is throwing away and prices it twice: in money and in tonnes of CO2, from the same energy in the same run. That is the module\'s carbon doctrine turned into arithmetic rather than a separate ESG spreadsheet reconciled once a year. Fired-heater efficiency, excess-air tuning, steam trap losses, condensate return, energy intensity and heat-integration targets all end up on one register.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the fuel analysis, the heater, the steam system, the intensity streams and the stream table auto-save. Every result is recomputed from them.',
  },
  {
    id: 'basis',
    icon: Scale,
    title: 'LHV or HHV, and why the app insists',
    content:
      'An efficiency on the lower heating value and one on the higher heating value differ by close to ten points on natural gas, for the same heater on the same day. Quoting one as the other is the single most common error in this field. So every efficiency here carries its basis, the moisture loss is computed differently on each - on HHV the latent heat of the water made from hydrogen is a real loss because HHV counted it as available, on LHV only the sensible heat of the vapour is - and the app refuses outright to compare two efficiencies on different bases.',
  },
  {
    id: 'stoich',
    icon: Flame,
    title: 'Combustion from your fuel analysis, not from a chart',
    content:
      'Air required, flue gas produced and the excess air implied by a measured stack oxygen all come from the carbon, hydrogen, oxygen and sulfur in the fuel and the oxygen content of air. It is an atom balance and nothing more. Inerts in the fuel are carried through to the flue gas, which matters: a fuel gas with thirty percent inerts has a very different flue gas from one without, and the nitrogen still has to be heated up the stack. The excess air is solved from the oxygen reading rather than taken from the usual shortcut formula, and the test that guards it puts the oxygen back and checks it comes out the same.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'The three things this app will not supply',
    content:
      'The radiation and convection loss, because it comes off a published chart against surface area and firing rate. The minimum safe stack oxygen, because below some excess air a burner makes carbon monoxide and where that point sits depends on the burner, the fuel and the draught control: the app will not recommend a setpoint you have not declared reachable, and it says so rather than quietly clamping. And the discharge coefficient for a failed trap, because it depends on the orifice and on how the trap failed, and a default would put a spurious precision on a figure that is already an estimate.',
  },
  {
    id: 'saving',
    icon: Gauge,
    title: 'Why the fuel saving is a ratio and not a difference',
    content:
      'Fuel is duty divided by efficiency, so tuning a heater from one efficiency to another saves the gap divided by the TARGET efficiency, not the gap divided by a hundred. Because the target is below a hundred, subtracting the efficiency percentages understates the saving. It is the safer of the two errors and it is still an error: it is how a tuning project gets turned down on a business case that was never right.',
  },
  {
    id: 'steam',
    icon: Droplets,
    title: 'Traps, condensate, and the term everyone forgets',
    content:
      'A trap that has failed open is a hole in the steam system. Above a pressure ratio of about two the flow through a hole is choked, meaning it depends on the upstream pressure and not at all on what is downstream, which is why a trap blowing into a condensate header loses much the same steam as one blowing to atmosphere. Condensate is worth more than its heat: it is treated water, so losing it costs fuel to reheat the makeup, the raw water, and the treatment again. The treatment is the term routinely left out of these business cases, so it is asked for separately and the value is called a floor until it is supplied.',
  },
  {
    id: 'intensity',
    icon: Scale,
    title: 'This is not EII',
    content:
      'The Solomon Energy Intensity Index is a proprietary benchmark with its own standard-energy methodology and a subscription behind it. Computing something similar and labelling it EII would be wrong in a way that matters commercially. What this computes is your own energy in per tonne of throughput, which is a real and useful number, compared against whatever peer figure you supply and have the right to use. The disclaimer travels with the result.',
  },
  {
    id: 'pinch',
    icon: GitMerge,
    title: 'Pinch targets, and why the pinch is a constraint',
    content:
      'The minimum hot and cold utility for a set of streams is a result, not a correlation, and the Problem Table Algorithm that finds it is short enough to write correctly. Every temperature is shifted by half the minimum approach - hot streams down, cold streams up - so that any exchange feasible in shifted space is feasible in real space. The surplus is cascaded down the temperature intervals; the most negative point is the heat that must come in from a hot utility, and the point that becomes zero once it is added is the pinch. Above the pinch the process needs heat and below it needs cooling, so heat carried across the pinch costs twice: one unit more hot utility and one unit more cold utility. Where one utility comes out at zero the app reports a threshold problem rather than inventing a pinch that is not there.',
  },
  {
    id: 'ledger',
    icon: Leaf,
    title: 'The register, in money and in carbon',
    content:
      'Every measure is priced from one fuel cost and one emission factor, so the money and the carbon come from the same energy and cannot disagree. Where no emission factor is supplied the carbon figure is absent rather than zero. The abatement cost per tonne is computed and handed on rather than ranked here: ranking measures into a marginal abatement cost curve is the Carbon Footprint & Abatement Studio\'s job, and duplicating it would create two rankings that could differ.',
  },
];

export const EnergyEfficiencyHelpContent = () => (
  <Accordion type="single" collapsible className="w-full" defaultValue="what">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem value={item.id} key={item.id}>
          <AccordionTrigger className="text-base hover:no-underline">
            <div className="flex items-center">
              <Icon className="w-5 h-5 mr-3 text-lime-400" />
              {item.title}
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-slate-300 pl-8 leading-relaxed">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

const EnergyEfficiencyHelpGuide = () => (
  <StudioHelp
    title="Energy & Utilities Efficiency Studio"
    description="Why the basis matters, what the app will not supply, and why the pinch is a constraint."
  >
    <EnergyEfficiencyHelpContent />
  </StudioHelp>
);

export default EnergyEfficiencyHelpGuide;
