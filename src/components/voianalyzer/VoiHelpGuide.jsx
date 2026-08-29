// Value of Information Analyzer help guide (Economics E2).
//
// Written against the D3 engine, which delegates the decision math to
// src/lib/decisionTree.js, so the Bayes-consistency section below describes a
// check the app actually performs.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, GitMerge, Percent, Scale, FolderOpen, AlertTriangle, Target,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What value of information means',
    content:
      'Information is worth paying for only when it can change what you do. Value of information is the increase in expected monetary value that comes from being able to act on what a survey, a test or a study tells you, before you commit. If a seismic survey would leave you drilling the well either way, its value of information is zero no matter how interesting the result is. This tool puts a number on that.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies and auto-save',
    content:
      'Use the Saved study selector at the top of the left rail to create a study. Once one is open, your decision, outcomes and information scenario auto-save about ten seconds after each change, and the save indicator shows when the last save happened. Click it to save immediately. Results are recomputed from the inputs on demand rather than stored.',
  },
  {
    id: 'decision',
    icon: Target,
    title: 'Step 1: State the decision and its outcomes',
    content:
      'Name the decision (for example, drill an exploration well) and give its cost. Then list the outcomes with a probability and a payoff each. Probabilities across outcomes should sum to 100 percent. Payoffs are gross of the decision cost, which the tool subtracts once. The alternative to acting is always available and pays zero, so a decision worth taking is one whose expected payoff clears its cost.',
  },
  {
    id: 'indicators',
    icon: GitMerge,
    title: 'Step 2: Describe what the information could say',
    content:
      'Name the information source and its cost, then list the indicators it can return, such as a positive or a negative seismic result. Each indicator needs the chance of seeing it, and, for each outcome, the chance of that outcome given you saw it. Those second numbers are posteriors, meaning the updated view of the world after the reading. Reliable information is information whose indicators separate the outcomes sharply; if every indicator leaves you with roughly your starting probabilities, the survey tells you nothing and the tool will say so with a value near zero.',
  },
  {
    id: 'bayes',
    icon: Percent,
    title: 'The consistency check, and why it matters',
    content:
      'Indicator chances and posteriors are typed in independently of the outcome probabilities above, so nothing forces them to agree. They must: averaging the posteriors over the indicator chances has to reproduce your stated outcome probabilities. When it does not, the app computes what your indicator numbers actually imply and shows both alongside each other in a consistency warning, rather than reporting a value of information built on numbers that contradict each other. The Decision Tree Builder derives these from reliabilities instead, so the two cannot disagree there.',
  },
  {
    id: 'read',
    icon: Scale,
    title: 'Reading the results',
    content:
      'EMV without information is the best you can do today. EMV with information is the best you can do once the reading is in hand, weighted by how likely each reading is, and after paying for it. Gross value of information is the difference before the cost; net value of information is after it. A positive net value means the information pays for itself on expected value grounds. EVPI, the expected value of perfect information, is what you would pay for a source that always told you the truth, and it is a hard ceiling: no real survey can be worth more than the EVPI, so a quoted price above it is not worth negotiating over.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'The tool ranks by expected monetary value, which is risk neutral. A company that cannot survive the dry-hole case should not take an EMV-positive gamble on that basis alone, and utility weighting is outside this app. One information source is evaluated at a time, so a sequenced programme (survey, then appraisal well, then development) needs the Decision Tree Builder. Payoffs are point values rather than distributions; where the upside itself is uncertain, value the outcomes in the NPV Scenario Builder or Petroleum Economics Studio first and bring the results here.',
  },
];

export const VoiHelpContent = () => (
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

const VoiHelpGuide = () => (
  <StudioHelp
    title="Value of Information Analyzer"
    description="How the decision tree is evaluated, and what the numbers do and do not tell you."
  >
    <VoiHelpContent />
  </StudioHelp>
);

export default VoiHelpGuide;
