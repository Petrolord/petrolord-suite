// Refinery Planning & Scheduling Studio help guide (DS3).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Layers, Calendar, GitCompare, Coins, AlertTriangle, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool is for, and why it is one tool',
    content:
      'The plan, the schedule and the actuals in one place, on one data model. Everywhere else these are separate products: the month is planned in one system, executed against another, and reconciled by hand in a spreadsheet weeks later, by which time the month is over and nobody can act on what it says. Here a plan event, a scheduled event and a recorded actual are the same shape, so the variance is a subtraction rather than a project.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved plans',
    content:
      'Create a plan from the selector at the top. The configuration, the period and the actuals you record auto-save. The plan itself, the schedule and the reconciliation are recomputed from those rather than stored, so a reopened plan cannot show numbers that no longer follow from its configuration.',
  },
  {
    id: 'plan',
    icon: Layers,
    title: 'How the plan is solved',
    content:
      'A linear programme: choose how much of each crude to run and how hard to run each unit so as to maximise margin, subject to a material balance on every stream, unit capacities and crude availability as bounds, and product demand floors and ceilings. It is the same solver the blending optimiser uses, at configuration scale.',
  },
  {
    id: 'yields',
    icon: Layers,
    title: 'Yields are data, not predictions',
    content:
      'A refinery\'s yields come from its own assays and unit models, and every planning system in the industry carries them as inputs. This one does the same rather than pretending to predict them. The Crude Assay Studio is where a crude\'s straight-run yields are worked out; unit yields come from your unit models or your own history.',
  },
  {
    id: 'balance',
    icon: GitCompare,
    title: 'The material balance, and why it is an inequality',
    content:
      'For every stream: what is made, less what units consume, less what goes into products, must be at least zero. At least, rather than exactly. A refinery can leave a stream unplaced, to fuel or to storage or sold as is, and forcing an equality would make the plan infeasible for the wrong reason. What is left over is reported as surplus, which is a real planning output: it is the stream nobody found a home for.',
  },
  {
    id: 'marginal',
    icon: Coins,
    title: 'What another barrel of a stream is worth',
    content:
      'The marginal value of each stream comes out of the same solve. It is the reason to run an LP rather than fill in a spreadsheet: it prices a debottleneck before anyone spends on one, and it tells you what a barrel of somebody else\'s intermediate would be worth to you. A stream worth nothing at the margin is one nobody has a home for. The sign convention is handled for you: this is what a barrel arriving from outside would add, not the derivative the solver returns.',
  },
  {
    id: 'schedule',
    icon: Calendar,
    title: 'The schedule',
    content:
      'The plan says how much over the month; the schedule says when. Crude arrives in cargoes of the size you set, units run at a steady rate across the period, and lifts are spread weekly. This gives the shape of the month to read actuals against. It is deliberately not a berth-level scheduler: tank capacity, jetty windows and turnarounds are not modelled, and the app says so on the schedule tab rather than letting you assume otherwise.',
  },
  {
    id: 'variance',
    icon: GitCompare,
    title: 'Reading the variance',
    content:
      'Volume variance is the difference in quantity valued at the planned unit value. Price variance is the difference in unit value on the quantity actually moved. They sum to the total exactly, and that exactness is what makes the split worth reporting: a decomposition with a residual is a reconciliation, not an attribution. A movement that appears in one ledger and not the other is listed as unmatched rather than folded into a price effect, because an unplanned cargo is not the price of anything. And a unit below plan is reported as a gap rather than labelled downtime, because the app does not know why.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'This is a configuration-level plan, not a unit simulator: yields are fixed vectors rather than functions of severity, so it will not tell you what happens if you push the reformer harder. Quality is not carried through the plan, so a stream that meets a specification here may not in reality; that is the blending optimiser\'s job. Blending and pooling constraints are absent for the same reason. The schedule is a shape, not a berth plan. And the plan optimises one period at a time, with no inventory carried between periods.',
  },
];

export const RefineryPlanningHelpContent = () => (
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

const RefineryPlanningHelpGuide = () => (
  <StudioHelp
    title="Refinery Planning & Scheduling Studio"
    description="How the plan is solved, how it cascades into a schedule, and how the variance against actuals is attributed."
  >
    <RefineryPlanningHelpContent />
  </StudioHelp>
);

export default RefineryPlanningHelpGuide;
