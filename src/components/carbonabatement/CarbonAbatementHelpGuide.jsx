// Carbon Footprint & Abatement Studio help guide (DS9).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, FileWarning, Scale, Flame, Ruler, BarChart3, GitMerge, TrendingDown, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'A roll-up, not a new data silo',
    content:
      'Every other app in this module computes carbon beside money from the same volumes. This one assembles those figures into an inventory, an intensity and a ranking of what to do about it. It is deliberately not a separate ESG system fed by its own spreadsheets once a year, because that is exactly the arrangement that makes the carbon number disagree with the operating number.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the potential set, the sources, the factors and the measures auto-save. Every result is recomputed from them.',
  },
  {
    id: 'notregister',
    icon: FileWarning,
    title: 'This is not a compliance register',
    content:
      'A regulatory register tracks obligations, evidence and deadlines, and Assurance owns that. This is the quantitative engine that feeds one. Building a second register here would create two records of the same obligation that could disagree, which is worse than having one.',
  },
  {
    id: 'computed',
    icon: FileWarning,
    title: 'Computed and reportable are different questions',
    content:
      'An inventory can be complete arithmetic and still not be something to file: a factor might have no source or version, a line might be missing its activity data, or the global warming potential set might never have been declared. Merging those two questions is how a working number ends up in a regulatory return. So the app computes what it can, states the total, and separately says whether the result is reportable and exactly which lines are the reason it is not.',
  },
  {
    id: 'factors',
    icon: Scale,
    title: 'Factors are registered, not shipped',
    content:
      'The API Compendium and the IPCC guidelines are published documents that get revised, and a factor without its source and version is not an auditable number. So a factor here is a record - value, unit, source, version, vintage - rather than a bare number. An unsourced factor is accepted, because refusing outright would make a first pass impossible, but it is flagged and it makes the inventory unreportable until it is fixed.',
  },
  {
    id: 'gwp',
    icon: Scale,
    title: 'The potential set is yours to declare',
    content:
      'Global warming potentials differ between IPCC assessment reports by enough to move a methane-heavy inventory by a fifth. An inventory on one report is not comparable with one on another, and they are compared constantly. So no values are shipped, the set you enter carries its own label, and every result states which set produced it. An inventory with no declared set is not reportable, whatever else is right about it.',
  },
  {
    id: 'atom',
    icon: Flame,
    title: 'Where the atom balance beats the factor',
    content:
      'Combustion CO2 is not an empirical factor at all: every carbon atom that goes into a burner comes out as CO2. A published fuel-based emission factor is a proxy for exactly that arithmetic, carrying whatever assumptions its author made about the fuel. So where the fuel analysis is known this computes CO2 from the carbon and says it did, and reserves factors for the things that really are empirical. Carbon that escapes combustion is counted as methane, which per atom is a far worse greenhouse gas - which is why a flare\'s destruction efficiency is asked for rather than assumed. It is the whole answer for a flare, and it is contested.',
  },
  {
    id: 'intensity',
    icon: Ruler,
    title: 'An intensity without a boundary means nothing',
    content:
      'Tonnes of CO2e per tonne of crude charged and per tonne of saleable product are different numbers for the same plant, and quoting one against another plant\'s other is how benchmarks get made up. The boundary is required, and the result states what it can legitimately be compared with: the same boundary and the same potential set.',
  },
  {
    id: 'macc',
    icon: BarChart3,
    title: 'The abatement curve, and why capital is annualised',
    content:
      'Measures are sorted cheapest first as a step chart: the width of each step is the tonnes it abates and its height is the cost per tonne. Capital is annualised over the measure\'s life with a capital recovery factor, because comparing a one-off capital cost against a recurring saving is the error that makes every measure look expensive. A negative cost per tonne means the measure pays for itself and abates carbon as a side effect; those sit on the left and are usually the ones nobody has done, which is the single most useful thing this chart says.',
  },
  {
    id: 'interaction',
    icon: GitMerge,
    title: 'What most abatement curves get wrong',
    content:
      'Two measures acting on the same emissions cannot both claim the full abatement. Insulating a line and then shutting it down do not abate twice, and the usual spreadsheet adds them anyway. This app does not silently merge them: it reports which measures interact, says the cumulative curve is therefore an upper bound, and separately catches the case where the claims against one source exceed what that source actually emits. It deliberately does not resolve the overlap on its own, because resolving it needs an engineering judgement about sequencing that a solver would only guess at.',
  },
  {
    id: 'path',
    icon: TrendingDown,
    title: 'The gap is named, not drawn as a wedge',
    content:
      'Each measure counts only from the year it starts, so the trajectory is what the identified measures actually deliver. Where that falls short of the target, the difference is reported as unabated with no measure identified, and the first year of shortfall is named. It is deliberately not drawn as a wedge labelled further measures: a wedge with nothing behind it is not a plan, and treating it as one is how decarbonisation roadmaps stop meaning anything.',
  },
];

export const CarbonAbatementHelpContent = () => (
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

const CarbonAbatementHelpGuide = () => (
  <StudioHelp
    title="Carbon Footprint & Abatement Studio"
    description="Why computed is not the same as reportable, why the potential set is yours to declare, and what most abatement curves get wrong."
  >
    <CarbonAbatementHelpContent />
  </StudioHelp>
);

export default CarbonAbatementHelpGuide;
