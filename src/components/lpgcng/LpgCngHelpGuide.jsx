// LPG & CNG Rollout Studio help guide (DS7).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, AlertTriangle, Recycle, Flame, Gauge, Wind, Car, Leaf, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'Two fuels, one commercial question',
    content:
      'LPG and CNG look like different businesses and they share more structure than they appear to. Both ask what it takes to put the fuel in front of a customer and whether the customer saves money by switching. A cylinder in circulation and a CNG trailer shuttling to a daughter station are the same problem, so there is one fleet model here rather than two. A bottling carousel and a dispensing forecourt are both queues, so this calls the same queue model the Terminal & Depot Studio uses for a loading rack, rather than writing a third one that could disagree with the other two.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the blend, the storage, the cascade, the compression and the conversion case auto-save. Everything on screen is recomputed from them.',
  },
  {
    id: 'fill',
    icon: AlertTriangle,
    title: 'The fill limit this app will not supply',
    content:
      'A pressure vessel in LPG service is never filled liquid-full. Liquid LPG expands with temperature, and a vessel with no vapour space ruptures hydraulically. The maximum fill ratio is set by the code in force for the product and the vessel, so this app implements the arithmetic and refuses to supply the limit: a default here would be a number somebody trusted. Enter the ratio your code requires and the storage figures appear. The vapour space is then reported as a figure in its own right rather than left as a subtraction, because it is the reason the vessel does not fail, not spare capacity.',
  },
  {
    id: 'blend',
    icon: Flame,
    title: 'Every property says how it mixes',
    content:
      'Liquid density mixes on volume. Latent heat per kilogram mixes on mass. Molar mass mixes on moles. Using the wrong basis is a quiet error of several percent that looks entirely plausible, so each property is labelled with the basis it was computed on. Where a property is missing on any component it is reported as missing for the whole blend rather than averaged over the components that have it, because a confident number built from half the blend is worse than an honest gap. Typical component properties are offered as a starting point with their ranges; the certificate of quality is the authority.',
  },
  {
    id: 'vaporizer',
    icon: Flame,
    title: 'Three terms in a vaporizer, not one',
    content:
      'Warm the liquid to its boiling point, boil it, then superheat the vapour clear of the dew point so it does not re-condense in the line. Skipping the third is how a vaporizer that is correctly sized on paper drops liquid into a burner. The terms are kept apart because they answer different questions, and a duty computed without one of them is called a floor rather than a duty.',
  },
  {
    id: 'float',
    icon: Recycle,
    title: "The cylinder float is Little's Law",
    content:
      'The number of assets in a system equals the rate they flow through it times the time each one spends in it. For a cylinder fleet that is cylinders sold per day times days round the cycle. Operators usually guess this number and usually guess it low, because the cylinders sitting at customers\' houses are invisible and are most of the fleet. The cycle is broken down so the dominant stage is obvious, which is nearly always the time at the customer and is the only term the operator can actually negotiate. The fleet rounds up, because half a cylinder does not exist, and spares are added on top of the circulating fleet rather than counted inside it.',
  },
  {
    id: 'realgas',
    icon: Gauge,
    title: 'CNG at 250 bar is not an ideal gas',
    content:
      'The compressibility factor at storage pressure is nowhere near one, so a bank holds appreciably more gas than the ideal gas law says, and a cascade sized on ideal gas is wrong by about a fifth in a direction nobody notices until the station is built. This uses the same Dranchuk and Abou-Kassem correlation the Facilities compression app uses rather than a second implementation, shows the factor it used so it can be checked against your own data, and says explicitly when the correlation is being asked to work outside the range it was fitted over.',
  },
  {
    id: 'cascade',
    icon: Wind,
    title: 'Why a cascade has banks',
    content:
      'A bank can only push gas into a vehicle while its pressure exceeds the vehicle\'s. Once they equalise the bank is finished for that vehicle no matter how much gas it still holds, which is exactly why a station runs several banks at different pressures instead of one large one. Each fill draws from the lowest bank that can still deliver and works upward, which is how a cascade is really sequenced. Gas sitting below the vehicle\'s target pressure is reported as stranded rather than counted as inventory: it is real gas and the cascade cannot deliver it. A part fill is not counted as a fill, because a vehicle that leaves under-filled did not get one.',
  },
  {
    id: 'compression',
    icon: Gauge,
    title: 'Compression is not reimplemented here',
    content:
      'Staging, polytropic head, real-gas Z at suction and discharge, interstage cooling and the discharge-temperature limit that usually governs the stage count all come from the Facilities compression engine. This studio converts the station\'s metric inputs into the field units that engine speaks, calls it, and converts the answer back. Reimplementing the thermodynamics would create a second set of numbers that could disagree with the first, and there would be no way to tell which was right.',
  },
  {
    id: 'conversion',
    icon: Car,
    title: 'The customer\'s decision',
    content:
      'Petrol is sold by the litre and CNG by the kilogram, so comparing prices per unit sold is meaningless. The comparison is per kilometre, which is what the customer actually buys. Where the vehicle\'s consumption on the new fuel has been measured, that is used. Where it has not, it is derived from energy equivalence and an explicit efficiency ratio, stated as an assumption on screen rather than hidden as a constant, because a converted engine is not necessarily as efficient on the new fuel and that ratio moves the answer more than the fuel price does. Simple payback is reported because it is the number this decision is actually made on, and it is labelled undiscounted; anything needing a discount rate belongs in the sanctioned economics engine, not here.',
  },
  {
    id: 'carbon',
    icon: Leaf,
    title: 'Cheaper and cleaner are separate questions',
    content:
      'A fuel that costs less per kilometre can still emit more per kilometre. This computes the two separately and will happily report a switch that saves money and adds carbon, because that is a real result and hiding it would make the studio an advocacy tool rather than an analysis one. Both emission factors are required: without them the carbon figure is absent and says so, rather than defaulting to zero.',
  },
];

export const LpgCngHelpContent = () => (
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

const LpgCngHelpGuide = () => (
  <StudioHelp
    title="LPG & CNG Rollout Studio"
    description="Why the fill limit is not supplied, why a cascade has banks, and why cheaper is not the same question as cleaner."
  >
    <LpgCngHelpContent />
  </StudioHelp>
);

export default LpgCngHelpGuide;
