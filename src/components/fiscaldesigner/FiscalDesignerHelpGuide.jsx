// Fiscal Regime Designer help guide (Economics E2).
//
// Written against the engine as E1 left it, so the cost-oil, cost-recovery
// and discounting statements below are the ones the code actually honours.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Landmark, Percent, Layers, LineChart, Scale, AlertTriangle, GitCompare,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool is for',
    content:
      'This is a regime sandbox. It lets you design fiscal terms and see, side by side on one project, how each one splits the money between the contractor and the government. Use it when the question is about the terms themselves: what a sliding scale royalty does to a marginal field, where an R factor split starts to bite, whether a cost recovery limit is the binding constraint. When the question is about a specific project under real Nigerian terms, take it to Petroleum Economics Studio, which is the module s single fiscal source of truth.',
  },
  {
    id: 'regimes',
    icon: Landmark,
    title: 'Building a regime',
    content:
      'A regime here is made of a royalty (flat or a sliding scale that steps with production rate), a cost recovery limit as a percentage of revenue after royalty, a profit split between contractor and government that can step with the R factor, and the tax terms: corporate income tax, an optional resource rent tax with a capital uplift, and an optional minimum tax on gross revenue. Start from a template and change the parts you care about. Every regime you define is compared on the same project, so differences you see are differences in the terms and nothing else.',
  },
  {
    id: 'costrecovery',
    icon: Layers,
    title: 'How cost recovery works here',
    content:
      'Costs enter the recoverable pool in the year they are incurred, capital and operating alike. Each year the contractor recovers as much of the pool as the cost recovery limit allows, that recovered amount is cost oil paid to the contractor, and whatever cannot be recovered this year carries forward to the next. What is left of revenue after royalty and cost oil is profit oil, and that is what the split and the tax apply to. Two defects here were fixed in August 2026: cost oil used to be deducted from profit oil and then credited to nobody, and operating cost used to be permanently unrecoverable because only capital cost ever entered the pool. Both biased every comparison against the contractor.',
  },
  {
    id: 'rfactor',
    icon: Percent,
    title: 'The R factor and sliding scales',
    content:
      'The R factor is cumulative revenue divided by cumulative cost, so it rises as a project pays back. Tiered splits let the government share grow once the contractor has been made whole, which is how most modern production sharing terms manage the front-end risk. Sliding scale royalty works the same way against production rate rather than payback. In both cases the tier that applies is chosen each year from that year s value, so watch how the take profile moves through the field life rather than judging a regime on its headline top rate.',
  },
  {
    id: 'read',
    icon: LineChart,
    title: 'Reading the comparison',
    content:
      'Summary gives NPV, IRR and take split per regime. Cash Flow shows the annual contractor and government streams so you can see when each side gets paid, which matters as much as the totals. Payout shows how long the contractor carries the project. Sensitivities runs the regimes over capital cost and price multipliers together, so you can find the terms that stay workable when a project comes in over budget into a weak price. Insights summarizes what the comparison shows.',
  },
  {
    id: 'ledger',
    icon: Scale,
    title: 'The ledger identity you can check',
    content:
      'On every regime and in every year, contractor take plus government take equals revenue minus costs. That identity is enforced by tests rather than assumed, and it is the fastest check on any fiscal model: money that is neither paid to the contractor nor collected by the government has been lost by the arithmetic. If you build a regime whose totals do not reconcile, that is worth reporting.',
  },
  {
    id: 'conventions',
    icon: GitCompare,
    title: 'Discounting convention',
    content:
      'This tool discounts at year end, matching Petroleum Economics Studio. The Suite screening engine behind the NPV Scenario Builder and the Breakeven Analyzer discounts mid year, which for identical cash flows makes its NPV larger by a factor of the square root of one plus the discount rate, about 4.9 percent at a 10 percent rate. That gap is a convention difference and is gated by a parity test, so a discrepancy of that size between the two tools is expected and anything larger is not.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'This is a screening model on a 25 year life with a generated production profile, not a full fiscal engine. It does not carry the PIA 2021 and Nigeria Tax Act 2025 framework switch, terrain and price based royalty schedules, hydrocarbon tax alongside companies income tax, production allowances with cap tracking, or capital allowance carryforward. All of those live in Petroleum Economics Studio. Design terms here, then take the regime you settled on there to value the project properly.',
  },
];

export const FiscalDesignerHelpContent = () => (
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

const FiscalDesignerHelpGuide = () => (
  <StudioHelp
    title="Fiscal Regime Designer"
    description="How a regime is built and compared, and where the full Nigerian fiscal math lives."
  >
    <FiscalDesignerHelpContent />
  </StudioHelp>
);

export default FiscalDesignerHelpGuide;
