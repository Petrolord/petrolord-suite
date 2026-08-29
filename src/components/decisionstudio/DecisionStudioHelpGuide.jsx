// Decision Studio help guide (Economics E2).
//
// Written against briefModel.js (D5): the brief is assembled from saved
// artifacts and every section carries a provenance line.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Package, GitMerge, BarChart3, FileDown, Fingerprint, AlertTriangle,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What Decision Studio is',
    content:
      'This is the executive layer over the rest of the module. It does not model anything of its own. It gathers the work you have already saved elsewhere in the Suite, a probabilistic economics run, a decision tree, a capital portfolio, puts them side by side, and produces a one page decision brief. The point is that the brief and the analysis behind it cannot drift apart, because the brief is assembled from the saved analyses themselves rather than retyped from them.',
  },
  {
    id: 'inputs',
    icon: Package,
    title: 'What you can pull in',
    content:
      'Three kinds of saved artifact. A Petroleum Economics Studio Monte Carlo run supplies the economics: the NPV distribution under full Nigerian fiscal terms. A saved decision tree supplies the recommendation and the expected value behind it. A capital portfolio supplies the funding context, showing whether this project makes the cut against everything else competing for the same capital. Each is optional. A brief with only economics is a valid brief; it simply says less.',
  },
  {
    id: 'compare',
    icon: BarChart3,
    title: 'Comparing cases',
    content:
      'Saved economics runs can be overlaid as cumulative NPV curves, one line per case. Reading them together is more informative than reading their P50s: two cases with the same P50 and different spreads are different propositions, and the case whose curve crosses zero furthest to the right is the one carrying the real downside. Curves come from the stored simulation results, so what you see is the run as it was made, not a fresh approximation of it.',
  },
  {
    id: 'recompute',
    icon: GitMerge,
    title: 'What is recomputed at brief time',
    content:
      'Tree expected values are rolled back from the stored tree by the canonical decision engine when the brief is built, and portfolios are re-optimized from their saved capital limit against your current project inventory. So a brief reflects the state of your inputs today rather than a cached number from whenever the analysis was first run. If a portfolio result moves between two briefs, the inventory moved.',
  },
  {
    id: 'provenance',
    icon: Fingerprint,
    title: 'Provenance, and why every number carries it',
    content:
      'Each section of the brief carries a line naming the saved item it came from, its identifier, when it was created, and for simulation results the seed and the iteration count. That is what lets a reader ask where a number came from and get an answer, and what lets you reproduce it a quarter later. Screening grade analyses are labelled as such in their own provenance lines, so nothing in a brief claims more rigour than it has.',
  },
  {
    id: 'export',
    icon: FileDown,
    title: 'The brief',
    content:
      'Give the brief a title, a recommendation in your own words and your name, then export it. The PDF renderer draws exactly the model described above and adds nothing to it, so there is no number in the document that did not come from a saved analysis or from what you typed into the recommendation.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'Decision Studio inherits the assumptions of whatever you feed it and states them rather than fixing them. It has nothing to say about anything you did not analyse: a brief built on one economics case shows one economics case. The recommendation line is yours, not the tool s. The right use is to make the reasoning behind a decision auditable, not to have the software make the decision.',
  },
];

export const DecisionStudioHelpContent = () => (
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

const DecisionStudioHelpGuide = () => (
  <StudioHelp
    title="Decision Studio"
    description="How a decision brief is assembled from saved analyses, and what its provenance lines mean."
  >
    <DecisionStudioHelpContent />
  </StudioHelp>
);

export default DecisionStudioHelpGuide;
