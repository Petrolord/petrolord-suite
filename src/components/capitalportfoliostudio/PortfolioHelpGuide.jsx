// Capital Portfolio Studio help guide (Economics E2).
//
// Written against src/utils/portfolioOptimizer.js (D4), so the objective,
// the quantization and the independence assumption below are the ones the
// optimizer actually uses.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Package, Target, TrendingUp, Scale, AlertTriangle, Coins,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool answers',
    content:
      'Given more good projects than capital, which set should you fund. The optimizer picks the combination that maximizes total risked expected value without exceeding your capital limit. That is a different question from ranking projects by return, and it gives a different answer: a portfolio built by taking the best return first can leave capital stranded, while the optimizer will take a slightly weaker project that fits the money you have left.',
  },
  {
    id: 'projects',
    icon: Package,
    title: 'Setting up projects and a portfolio',
    content:
      'A portfolio carries a capital limit. Each candidate project carries its capital cost, its expected value, and optionally a chance of success and the cost of failure. All money is in millions of dollars. Projects are saved to your account, so a portfolio can be revisited and re-optimized as estimates firm up.',
  },
  {
    id: 'emv',
    icon: Coins,
    title: 'How a project is valued',
    content:
      'Risked expected value is the chance of success times the success case value, less the chance of failure times what failure costs you. Success value and risk are kept separate rather than blended into one number, which is the same convention the prospect risking engine in ReservoirCalc Pro uses, so a risked portfolio value and a risked prospect value mean the same thing across the Suite. A project whose risked value is negative is never forced into the portfolio: leaving capital unspent is always allowed.',
  },
  {
    id: 'optimizer',
    icon: Target,
    title: 'What the optimizer does',
    content:
      'It solves a zero or one knapsack: each project is either funded in full or not funded, and the total capital of the funded set cannot exceed the limit. The solution is exact for the quantized problem it is given. Capital amounts are quantized onto a fixed grid so the computation stays bounded whatever units you type the limit in, and the resulting resolution is reported alongside the answer. Read that resolution as the granularity of the result: two portfolios whose totals differ by less than it are not meaningfully different.',
  },
  {
    id: 'frontier',
    icon: TrendingUp,
    title: 'The efficient frontier',
    content:
      'The frontier sweeps the capital limit and re-optimizes at each level, so you can see what each additional increment of capital buys. The shape matters more than any single point. A steep stretch means capital is still productive and an argument for more of it; a flat stretch means you have funded everything worth funding and the marginal project adds little. The kink between them is the honest answer to how much capital this opportunity set can absorb.',
  },
  {
    id: 'risk',
    icon: Scale,
    title: 'The portfolio risk summary',
    content:
      'Alongside the selection, the tool reports the mean and spread of the portfolio value and the chance the portfolio as a whole comes out below zero. Each project is treated as a mixture of its success and failure cases, which is exact, and the sum across projects is approximated as a normal distribution, which is reasonable when several independent projects are in play and rough when only one or two are.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'Projects are treated as independent. Real portfolios are not: projects sharing a basin, a partner, a rig contract or a price deck fail together, and a correlated portfolio has a fatter downside than this summary shows. Treat the probability of a loss as a floor. Funding is all or nothing, so a project that could be phased or farmed down needs to be entered as separate candidates. Capital is the only constraint modelled, so rig availability, people and schedule are yours to check. The values you enter should come from a real valuation: build them in Petroleum Economics Studio or the NPV Scenario Builder rather than typing an estimate straight in.',
  },
];

export const PortfolioHelpContent = () => (
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

const PortfolioHelpGuide = () => (
  <StudioHelp
    title="Capital Portfolio Studio"
    description="How the funded set is chosen, what the frontier shows, and where the risk summary stops."
  >
    <PortfolioHelpContent />
  </StudioHelp>
);

export default PortfolioHelpGuide;
