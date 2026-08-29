// Fuel Pricing & Supply Chain Studio help guide (DS6).
import React from 'react';
import {
  BookOpen, Scale, Layers, Droplets, Truck, Building2, TrendingUp, AlertTriangle, FolderOpen,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'A litre of petrol at a forecourt began as a cargo priced off a marker in dollars per tonne. Between the two sit a freight rate, an ocean loss, a duty, a handful of statutory charges, an exchange rate, a truck and several margins set by regulation. This studio builds that chain end to end so the answer can be inspected, argued with and re-run at a different exchange rate, instead of being rebuilt in a spreadsheet every time a rate moves.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the cargo, your rates, the lane and the station auto-save. Every result on screen is recomputed from them, so nothing stored can go stale against what is shown.',
  },
  {
    id: 'rates',
    icon: AlertTriangle,
    title: 'Why no rates are shipped',
    content:
      'Duties, levies, statutory charges and regulated margins are set by regulation, they differ by market and they change. A rate baked into this app would be read as authority and would go stale in silence, which is worse than no number at all. So the templates ship the line items, which are stable, with the rates required. Until they are supplied the app calls the total a floor rather than a cost, because an understated landed cost is not a small error in this business; it is the error that loses the cargo.',
  },
  {
    id: 'order',
    icon: Layers,
    title: 'The order of the build-up is part of the answer',
    content:
      'A charge levied as a percentage of CIF depends on what CIF already is, so the stages are walked in sequence and each line declares the base it bites on: FOB, then C&F, then CIF, then the landed charges. Charges at the same stage cannot inflate each other\'s base. Reordering the lines changes the number, which is exactly why the order is data here rather than an accident of how a spreadsheet grew.',
  },
  {
    id: 'loss',
    icon: Droplets,
    title: 'Ocean loss divides, it does not add',
    content:
      'You pay for the bill-of-lading quantity and you sell the outturn quantity. If half a percent is lost in transit, the cost of what you can actually sell rises by one divided by 0.995, not by 1.005. The two differ by a hair on one cargo and by real money over a year, and the wrong one is the one usually written down. The same logic runs on the truck: cost per litre is divided by what is delivered, not by what was loaded.',
  },
  {
    id: 'cap',
    icon: TrendingUp,
    title: 'The cap, and the rate at which it breaks',
    content:
      'Where a regulated price cap applies, it is compared against the build-up. A cap below the chain does not make the cost disappear; it creates a shortfall that somebody in the chain is absorbing, and naming that number is the point of the exercise. The exchange-rate sensitivity re-prices the whole chain at each rate rather than scaling it, because only part of the build-up is in dollars, and then solves for the rate at which the cap stops covering the chain. If the price never crosses the cap in the range searched, the app says so rather than returning an endpoint dressed up as a breakeven.',
  },
  {
    id: 'waterfall',
    icon: Scale,
    title: 'Where the money in a litre goes',
    content:
      'The build-up is grouped by recipient, which is the question actually being asked whenever a pump price is argued about in public: how much of this is the product, how much is government, how much is the chain. Elements with no recipient named are grouped as unattributed rather than assigned to anybody, because guessing a recipient is how these arguments go wrong.',
  },
  {
    id: 'lane',
    icon: Truck,
    title: 'The lane and the fleet',
    content:
      'Trips per truck are derived from the cycle time, not taken as an input. That matters because it is the cycle, not the distance, that decides how many trips a truck makes and therefore how its fixed costs spread: a slow lane carries more capital cost per trip than a fast one of the same length. Fleet size rounds up, because a fraction of a truck does not exist, and the spare capacity that rounding buys is reported rather than buried, since it is the argument for whether the last truck should be owned or hired.',
  },
  {
    id: 'station',
    icon: Building2,
    title: 'The station, and the load that will not fit',
    content:
      'A forecourt and a loading rack are the same queueing system in different units, so this calls the rack model built for the Terminal & Depot Studio rather than writing a second one that could disagree with it. Utilisation alone is misleading: a forecourt at 85 percent does not have 15 percent spare, it has a queue. Tank cover is counted on usable stock rather than tank capacity, and the app checks the ullage at the reorder level against the delivery payload, which is the arithmetic nobody does until a full truck has been turned away from the forecourt twice.',
  },
];

export const FuelPricingHelpContent = () => (
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

const FuelPricingHelpGuide = () => (
  <StudioHelp
    title="Fuel Pricing & Supply Chain Studio"
    description="How a cargo becomes a pump price, why no rates are shipped, and what breaks the price."
  >
    <FuelPricingHelpContent />
  </StudioHelp>
);

export default FuelPricingHelpGuide;
