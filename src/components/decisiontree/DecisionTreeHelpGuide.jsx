// Decision Tree Builder help guide (Economics E2).
//
// Written against src/lib/decisionTree.js (D3): rollback, the Bayes-consistent
// information template, and the EPE Monte Carlo payoff link.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, GitMerge, Sigma, Link2, Layers, Scale, AlertTriangle, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What a decision tree is for',
    content:
      'A decision tree lays out a sequence of choices and the uncertain events between them, then works out what each choice is worth today given that you will keep choosing well later. It is the right tool when the decision has stages: drill or farm out, and if you drill, appraise or go straight to development. A single expected value calculation cannot capture that, because the value of the first choice depends on what you would do after each possible result.',
  },
  {
    id: 'nodes',
    icon: GitMerge,
    title: 'Building the tree',
    content:
      'There are three kinds of node. A decision node is a choice you control, drawn as a square, and its value is the best of its branches. A chance node is an event you do not control, drawn as a circle, and its branches carry probabilities that must sum to one. A terminal node carries a payoff. Branches can carry a cost, which is subtracted as you pass along them, so a drilling cost sits on the drill branch rather than being netted off every outcome by hand. Start from a template and reshape it: the shipped templates cover drill or farm out, and value of information.',
  },
  {
    id: 'rollback',
    icon: Sigma,
    title: 'How the tree is solved',
    content:
      'The tree is solved by rolling back from the terminal nodes. A chance node takes the probability weighted average of its branches; a decision node takes the best branch and records which one. Repeating that back to the root gives the expected monetary value of the whole decision and, more usefully, the policy: which branch to take at every decision node, including the ones you have not reached yet. Probabilities that do not sum to one are reported as an error rather than silently normalized, because a tree whose chances do not add up is not a model of anything.',
  },
  {
    id: 'voi',
    icon: Layers,
    title: 'The value of information template',
    content:
      'The information template builds the classic buy-a-survey-first tree from what you actually know: your prior probabilities on the outcomes, and how reliable the signal is, meaning the chance of each reading given each true state. Posteriors and reading frequencies are then derived rather than typed, so they cannot contradict your priors. That is the difference between this and the standalone VOI Analyzer, which takes those numbers as separate inputs and has to check them for consistency afterwards.',
  },
  {
    id: 'link',
    icon: Link2,
    title: 'Linking payoffs to real valuations',
    content:
      'A terminal payoff can be linked to a saved Petroleum Economics Studio Monte Carlo run instead of being typed. The tree then sits on a full fiscal probabilistic valuation rather than on a number someone remembered, and when the valuation is updated the tree can be re-solved against it. This is the chain the module is built around: volumes, forecast, fiscal valuation, then decision.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saving, importing and exporting',
    content:
      'Trees are saved to your account and can be reopened, exported to a file and imported back. Export the tree alongside any brief that quotes its EMV, so the structure and the numbers behind a recommendation stay together.',
  },
  {
    id: 'read',
    icon: Scale,
    title: 'Reading the result',
    content:
      'The root EMV is what the decision is worth today under your numbers. The highlighted path is the policy, meaning what to do now and what to do after each result. The most useful output is often not the EMV itself but how close the top two branches are: when they are within a few percent of each other, the decision is not really being made by the numbers, and effort is better spent reducing the uncertainty that separates them.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'Expected monetary value is risk neutral, so a tree will happily recommend a gamble that would sink the company if it lost. Where that is a real concern, judge the branch spread as well as its mean. Probabilities and reliabilities are your judgement and the answer is only as good as they are; run the ones you are least sure about up and down and see whether the recommended branch changes, because a policy that flips on a plausible probability change is not yet a decision.',
  },
];

export const DecisionTreeHelpContent = () => (
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

const DecisionTreeHelpGuide = () => (
  <StudioHelp
    title="Decision Tree Builder"
    description="How a multi-stage tree is built and solved, and what the policy it returns means."
  >
    <DecisionTreeHelpContent />
  </StudioHelp>
);

export default DecisionTreeHelpGuide;
