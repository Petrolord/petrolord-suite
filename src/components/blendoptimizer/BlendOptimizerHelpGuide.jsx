// Product Blending Optimizer help guide (DS2).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Scale, Target, Coins, Gauge, AlertTriangle, FolderOpen, FileWarning,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool answers',
    content:
      'Given the components in your pool, their costs and their qualities, what is the cheapest recipe that meets every specification. It is a continuous decision rather than a menu, so it is solved as a linear programme: the optimum sits on a vertex where some set of specifications binds exactly, and the solver finds that vertex and tells you which ones bind.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top. Your pool, specifications and prices auto-save about ten seconds after each change. The recipe is recomputed from them rather than stored, so a reopened study cannot show a recipe that no longer follows from its inputs.',
  },
  {
    id: 'basis',
    icon: Scale,
    title: 'Every specification declares how its property blends',
    content:
      'This is the modelling decision and it is visible rather than buried. A volume-basis property mixes linearly on volume. A mass-basis property, which is anything in weight percent or ppm by mass such as sulfur, mixes on mass, and the mass weighting comes from the densities: use volume for sulfur and you will report a blend that is on-spec when it is not. An index-basis property does not mix linearly at all and is linearised through a stated index, blended, and inverted. All three are linear in the volumes, which is what keeps this a linear programme rather than something that needs a different solver.',
  },
  {
    id: 'octane',
    icon: FileWarning,
    title: 'Octane, and what the app will not pretend about it',
    content:
      'Octane does not truly blend linearly. A component\'s effective octane depends on the pool it sits in, which is why refiners carry measured blending octane numbers rather than neat ones. The published index methods are coefficient tables, and this package does not reproduce published tables from memory. So: if you have blending octane numbers, enter those and they are used as given. If you enter neat octane it is blended linearly and the result is labelled as the approximation it is. The same applies to cetane, and the ASTM D4737 cetane index, which computes cetane from density and distillation, is not implemented for the same reason.',
  },
  {
    id: 'rvp',
    icon: Gauge,
    title: 'RVP and viscosity',
    content:
      'RVP is blended through an index, because light ends dominate the vapour space: a splash of butane lifts a whole blend far more than its volume suggests, and treating it linearly will put you over the limit in a tank. The index exponent is a named, adjustable parameter rather than a constant buried in the code, because refiners tune it to their own pools and because a value that influential should be visible. Viscosity uses the Refutas index on mass, the same one the assay studio uses, so a viscosity means the same thing in both.',
  },
  {
    id: 'reading',
    icon: Target,
    title: 'Reading the answer: binding, slack, and infeasible',
    content:
      'A binding specification is one the optimum sits exactly on; it is what is stopping the blend getting cheaper. A slack one has room and is not currently costing you anything. And infeasible is a real answer, not a failure: it means no mixture of these components can meet these limits, so either a limit has to move or the pool needs a component that can reach it. The app says which rather than returning a recipe that misses.',
  },
  {
    id: 'giveaway',
    icon: Coins,
    title: 'Quality giveaway',
    content:
      'Giveaway is quality handed over for nothing: the gap between what the blend achieves and what it had to achieve. Half a point of octane over the whole month is real money, and it is invisible unless someone measures it. Put a value on a unit of the property and the app prices the gap over the volume blended. Where you do not, the gap is still shown without a price on it, because a giveaway figure built from a guessed unit value would be worse than none.',
  },
  {
    id: 'shadow',
    icon: Coins,
    title: 'What each constraint is costing',
    content:
      'The shadow price of a specification is what one unit of relief on it would save. It is often the most useful number on the screen: it is the argument for a waiver, for a different crude, or for the octane investment. Zero means the constraint is not binding and relaxing it buys nothing. The volume row\'s price is the marginal cost of one more barrel of product.',
  },
  {
    id: 'templates',
    icon: AlertTriangle,
    title: 'The specification templates',
    content:
      'They are starting points so you do not begin from an empty table, and every limit is editable. They are NOT a compliance oracle. Fuel specifications are set by regulation, they differ by market, and they change; the regulation in force governs and these must be checked against it. Nothing here should be cited as the requirement.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'The blend is modelled as ideal: volumes are assumed to mix without shrinkage and there are no interaction terms between components beyond what the indices carry. A specification the pool cannot support, because not every component carries that property, is reported as not applied rather than assumed, so read that list. Distillation specifications beyond flash point are not modelled. And this optimises one blend at a time: scheduling a month of blends across tanks is the planning studio, not this one.',
  },
];

export const BlendOptimizerHelpContent = () => (
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

const BlendOptimizerHelpGuide = () => (
  <StudioHelp
    title="Product Blending Optimizer"
    description="How the recipe is solved, how each property is blended, and what binding, giveaway and shadow prices mean."
  >
    <BlendOptimizerHelpContent />
  </StudioHelp>
);

export default BlendOptimizerHelpGuide;
