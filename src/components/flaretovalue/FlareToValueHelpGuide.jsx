// Flare Gas to Value Studio help guide (DS10).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Flame, Droplets, Filter, Calculator, AlertTriangle, Leaf, Gavel, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'A volume of gas is being burned for nothing. This screens the handful of routes that would turn it into something - compressed gas, mini LNG, liquids extraction, power - against the gas that is actually there rather than the gas a brochure assumed, prices each one, and says what recovering it would really abate. It is the module\'s bridge back upstream, and it is the app a bid gets written from.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the gas analysis, the parcel, the route envelopes, the counterfactual and the credit case auto-save. Every result is recomputed from them.',
  },
  {
    id: 'counterfactual',
    icon: AlertTriangle,
    title: 'The claim this app exists to stop',
    content:
      'You cannot claim a flare\'s whole emission as abatement unless the gas is never burned. Recover it and sell it and the customer burns it, emitting CO2 in a truck instead of at the flare tip. The abatement is the difference against a stated counterfactual, and it is not reliably smaller or larger than the flare\'s gross figure: if the product displaces a dirtier fuel the abatement is larger, because the diesel that is no longer burned is abated too; if it simply adds combustion where there was none it is smaller, and it can be negative. Which way it goes is not knowable without the counterfactual, so a gross claim is not a conservative shortcut - it is simply a different number from the right one. This app reports no abatement at all until you state what the product displaces and what burning it emits.',
  },
  {
    id: 'flare',
    icon: Flame,
    title: 'Most of a flare is often the methane it fails to burn',
    content:
      'Flaring emits CO2 from the carbon that burns and methane from the carbon that does not, and methane is a far worse greenhouse gas per tonne. On a typical parcel at ninety-odd percent destruction, the few percent of carbon that escapes unburned can carry close to half the flare\'s CO2e. That is why the destruction efficiency is a required input rather than an assumed figure: for a flare it is most of the answer, and it is contested. The app computes the CO2 from the carbon in the gas atom by atom, so the two products always account for every carbon atom between them.',
  },
  {
    id: 'gas',
    icon: Droplets,
    title: 'The liquids content, derived rather than looked up',
    content:
      'Gallons of recoverable hydrocarbon per thousand standard cubic feet is the number that decides whether extracting liquids is even a conversation. It is derived here from the composition and the component liquid densities - the moles in a thousand cubic feet, times the molar mass, divided by the liquid density - rather than read off a table. Inerts are tracked separately, and carbon dioxide separately again from inerts as a whole, because a liquefaction train cares about CO2 specifically: it freezes in the cold box and has to come out first.',
  },
  {
    id: 'screening',
    icon: Filter,
    title: 'Three screening states, not two',
    content:
      'A route passes, fails, or is not fully screened. A requirement with no limit set is reported as unchecked rather than passed, because an unset limit is not a satisfied one and treating it as one is how a route gets through screening nobody actually did. A failure names which requirement failed, what the gas is, what the limit was and by how much it missed, because "not feasible" is not an answer anybody can act on. The limits themselves ship unset: a licensor\'s CO2 limit is a design choice and the minimum viable volume moves with the market, so shipping numbers would be shipping somebody else\'s project as if it were a rule.',
  },
  {
    id: 'economics',
    icon: Calculator,
    title: 'Recovery is asked for, and valuation is handed on',
    content:
      'The recovery fraction is a required input per route, because it is a process design outcome rather than a property of the gas, and a recovery quietly assumed at a hundred percent is the optimism that sinks these business cases. Capital is scaled from a reference plant by the same power law the Modular Refinery Feasibility Studio uses, not a second implementation. And the studio stops at the cash flow: capital, operating cost and revenue are assembled and handed to the sanctioned economics engine, because a second discounted cash flow in this module would be a second answer.',
  },
  {
    id: 'credits',
    icon: Leaf,
    title: 'Whether it needs credits is not the same as what they are worth',
    content:
      'A project that clears its hurdle without carbon credits is robust; one that only clears with them is a bet on a credit price, and those are different things to put in front of a board. So the app reports which it is, and where credits are needed it names the price at which the case turns. It will not price credits at all off a gross flare figure, because a credit computed from an abatement that cannot be substantiated is a credit that cannot be issued.',
  },
  {
    id: 'bid',
    icon: Gavel,
    title: 'Routes that fail stay in the table',
    content:
      'A route that failed screening is kept in the comparison with its failure named, rather than dropped. A route missing from a comparison reads as one nobody considered, and in a bid that is the difference between thorough and careless. The ranking is on gross margin per Mscf, which ignores the capital entirely, and the app says so beside the number: compare it against the capital column before concluding anything, then value the shortlist properly.',
  },
];

export const FlareToValueHelpContent = () => (
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

const FlareToValueHelpGuide = () => (
  <StudioHelp
    title="Flare Gas to Value Studio"
    description="Why the flare's gross emission is not the abatement, why screening has three states, and what a bid actually turns on."
  >
    <FlareToValueHelpContent />
  </StudioHelp>
);

export default FlareToValueHelpGuide;
