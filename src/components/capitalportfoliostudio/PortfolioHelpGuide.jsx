// Capital Portfolio Studio help guide (Economics E2).
//
// Written against src/utils/portfolioOptimizer.js (D4), so the objective,
// the quantization and the independence assumption below are the ones the
// optimizer actually uses. Re-verified against the EC5-0 engine (owner
// decision 2026-09-14): seeded Monte Carlo risk cards, the grid overshoot
// flag and the negative capex refusal.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Package, Target, TrendingUp, Scale, AlertTriangle, Coins, Link2,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool answers',
    content:
      'Given more good projects than capital, which set should you fund. The optimizer picks the combination that maximizes total risked expected value within your capital limit, measured on its capital grid. That is a different question from ranking projects by return, and it gives a different answer: a portfolio built by taking the best return first can leave capital stranded, while the optimizer will take a slightly weaker project that fits the money you have left.',
  },
  {
    id: 'projects',
    icon: Package,
    title: 'Setting up projects and a portfolio',
    content:
      'A portfolio carries a capital limit. Each candidate project carries its capital cost, its NPV P90, P50 and P10 (P90 is the low case), and optionally a chance of success and the cost of failure. A capital cost cannot be negative: the form refuses one, and the optimizer stops with a message if one reaches it. All money is in millions of dollars ($MM). Projects are saved to your account, so a portfolio can be revisited and re-optimized as estimates firm up.',
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
      'It solves a zero or one knapsack: each project is either funded in full or not funded. The solution is exact for the quantized problem it is given. Capital amounts are quantized onto a fixed grid so the computation stays bounded whatever units you type the limit in, and the resulting resolution is reported alongside the answer. Read that resolution as the granularity of the result: two portfolios whose totals differ by less than it are not meaningfully different. Because each project\'s capital is rounded to the grid, the funded set\'s real capital can overshoot the limit by up to half a cell per project. When that happens the app flags it and shows the amount over the limit, so check the set against the real limit before committing to it.',
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
      'Alongside the selection, the tool reports the mean and spread of the portfolio value, the chance the portfolio as a whole comes out below zero, and the NPV P90 and P10. Each project is treated as a mixture of its success and failure cases. The mean and spread are worked out exactly from that mixture. The loss probability and the P90 and P10 come from a seeded Monte Carlo that draws each project\'s success or failure and sums the outcomes, 10,000 iterations by default. The cards show the method, the iteration count and the seed, so the same inputs reproduce the same numbers. P90 is the low case and P10 the high case. With one or two risked projects the distribution is lumpy, and a P10 can sit on a failure outcome.',
  },
  {
    id: 'correlation',
    icon: Link2,
    title: 'Correlation, and why zero is the friendliest answer',
    content:
      'The correlation slider is the average correlation between project outcomes. At zero every project is independent, which is the most flattering assumption a portfolio can be given: independent risks cancel, so the spread narrows and the chance of an overall loss looks small. Real projects sharing a basin, a partner, a rig contract or a price deck move together and can lose together. Raise the slider and the expected value stays exactly where it was while the spread grows, because correlation moves the shape of the distribution and never its centre. At a correlation of one, diversification buys nothing and the reported spread is simply the sum of the project spreads. In the Monte Carlo the correlation links the projects\' underlying success and value drivers, so the outcomes themselves move together somewhat less than the slider value; on a portfolio expected to make money, more correlation usually means a higher chance of a loss. If you do not know the number, run it at zero and again at a half and see whether the decision survives both.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'Correlation is one average figure rather than a matrix, which is as much precision as a screening tool can honestly ask for; a portfolio whose projects are correlated in very different degrees needs more than this. The risk cards are a sample: another seed gives slightly different figures, which is why the seed is shown. Funding is all or nothing, so a project that could be phased or farmed down needs to be entered as separate candidates. Capital is the only constraint, so rig availability, people and schedule are yours to check. The values you enter should come from a real valuation: build them in Petroleum Economics Studio or the NPV Scenario Builder rather than typing an estimate straight in.',
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
