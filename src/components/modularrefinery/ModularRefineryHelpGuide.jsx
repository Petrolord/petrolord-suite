// Modular Refinery Feasibility Studio help guide (DS4).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Scale, Layers, Fuel, DollarSign, FileCheck, AlertTriangle, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool answers',
    content:
      'Whether a modular refinery of a given size, on a given crude, in a given market, is worth building. It takes a configuration and a capacity, works out what the barrel becomes and what that is worth, scales the capital, values the project, and puts the crude supply question beside the answer rather than in an appendix.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; everything auto-saves. Results are recomputed from the inputs rather than stored, so a reopened study cannot show an answer that no longer follows from what is in it.',
  },
  {
    id: 'scale',
    icon: Scale,
    title: 'The scaling argument, which is the point of this app',
    content:
      'The tools this competes with were built for very large stick-built refineries, and their most consequential assumption is capital scaling. Stick-built cost follows the six-tenths rule: doubling capacity costs about 1.5 times as much, because a bigger vessel is cheaper per barrel than two smaller ones. That single relationship is why the industry believes small refineries cannot work. A modular refinery does not scale that way. You do not build a bigger vessel, you build another train, so cost is close to linear in capacity and the economy of scale largely disappears. The app models both and shows them side by side, because burying that comparison inside one number would be the wrong service. And it cuts both ways honestly: the small plant loses far less to scale than the rule implies, and the big one gains far less.',
  },
  {
    id: 'exponents',
    icon: Scale,
    title: 'The exponents are yours to set',
    content:
      'Both scaling exponents are inputs rather than constants buried in the code, because a real study uses vendor quotations rather than a rule of thumb, and because a value that influential should be visible. Replace the reference cost and capacity with a quotation and the curves become yours.',
  },
  {
    id: 'configuration',
    icon: Layers,
    title: 'Configurations and yields',
    content:
      'Topping separates the barrel and sells what comes out. Hydroskimming adds reforming and hydrotreating, so you make on-specification gasoline and low-sulfur diesel, which is usually what a local market actually wants. Conversion adds cracking, so residue becomes transport fuel instead of fuel oil: more capital, and a far better slate on a heavy crude. The yields shipped with each are screening defaults so you do not start from an empty table; a real study takes them from the crude\'s own assay, which is exactly what the Crude Assay Studio computes from a TBP curve and a cut set.',
  },
  {
    id: 'supply',
    icon: Fuel,
    title: 'Crude supply, the constraint that actually decides these projects',
    content:
      'A modular refinery in a producing country is rarely defeated by its engineering. It is defeated by not being able to buy crude at a price and a reliability it can plan around. So supply is a scenario on utilisation and on the crude premium, and it sits on the input panel beside the capacity. The three scenarios are named futures rather than probabilities: attaching an invented likelihood to each would not be honest. If you have a real distribution, that belongs in a Monte Carlo, not in a dropdown.',
  },
  {
    id: 'economics',
    icon: DollarSign,
    title: 'How the project is valued, and by what',
    content:
      'The engine here stops at the physical and cash streams, and the valuation is done by the Suite\'s sanctioned screening economics engine, the same one behind the NPV Scenario Builder and the Breakeven Analyzer. That is deliberate: the Economics module spent a whole phase removing a fifth and a sixth NPV implementation, and this app is not going to add a seventh. So an NPV here means what an NPV means anywhere else in the Suite. Full Nigerian fiscal detail under the PIA and the Nigeria Tax Act belongs to Petroleum Economics Studio, and a project heading for sanction should be valued there.',
  },
  {
    id: 'licensing',
    icon: FileCheck,
    title: 'The licensing tracker',
    content:
      'Establish, construct, operate: the sequence a refinery project moves through, with what each stage typically needs. It is a tracking aid and not legal advice. The sequence is the shape of the process; what any stage requires in a given year is set by the regulator and changes, so the regulator\'s current requirements govern. The app will tell you if you have ticked a later stage without an earlier one, because that is a data-entry slip rather than a shortcut.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'This is a feasibility screen, not a design. Yields are fixed vectors rather than functions of operating severity. Capital is scaled from a reference point rather than estimated bottom-up, so it is only as good as that reference. Working capital, financing structure and depreciation detail are not modelled; the screening engine applies a flat tax and royalty. Product prices are yours to supply and are the single largest sensitivity in the answer. And a study whose yields do not account for the whole barrel is reported as such rather than normalised, because the gap is usually a modelling error worth finding.',
  },
];

export const ModularRefineryHelpContent = () => (
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

const ModularRefineryHelpGuide = () => (
  <StudioHelp
    title="Modular Refinery Feasibility Studio"
    description="How capital scales for a modular plant, how the project is valued, and what decides it."
  >
    <ModularRefineryHelpContent />
  </StudioHelp>
);

export default ModularRefineryHelpGuide;
