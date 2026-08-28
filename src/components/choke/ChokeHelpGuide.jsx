// Choke & Wellhead Performance Studio help content (Production P8).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Gauge, TrendingUp, Sigma, Wind, Snowflake, Link2, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It answers what a bean size does on a particular well, and what would happen if you changed it. That is not the same as running a choke correlation: the correlation on its own tells you what wellhead pressure a rate needs, but on a real well the rate is whatever the well, the tubing and the bean settle at together. So the choke goes into the nodal solve as a surface constraint, and a bean size comes out as a rate.',
  },
  {
    id: 'constraint',
    icon: Gauge,
    title: 'The choke as a constraint, not a calculation',
    content:
      'Ordinary nodal analysis solves the inflow against the tubing at a fixed wellhead pressure. A choked well has no fixed wellhead pressure: the bean sets it. So the chain runs the other way round. For a candidate rate the choke says what wellhead pressure it takes, the tubing says what bottomhole pressure that needs, and the inflow says what bottomhole pressure that rate actually gives. Where the last two agree is the operating point. One equation in one unknown, solved on the difference between them.',
  },
  {
    id: 'critical',
    icon: Wind,
    title: 'Where the correlation stops',
    content:
      'The Gilbert family is a CRITICAL-flow correlation. It holds while the downstream pressure is below roughly 55 percent of the wellhead pressure; above that the flow is subcritical and the correlation simply does not apply. That matters practically as well as theoretically, because below critical flow the bean has stopped controlling the well and the line pressure is doing it instead: opening the bean further buys much less than the curve suggests. The studio finds the bean size where that happens and marks everything past it as out of range rather than drawing it as if it were fine. On a gas well the same question is answered exactly rather than by a rule of thumb, because the sonic condition is thermodynamic and comes from the heat capacity ratio.',
  },
  {
    id: 'envelope',
    icon: TrendingUp,
    title: 'The operating envelope',
    content:
      'What the well makes at every bean size, with the wellhead pressure it holds back alongside it. Each point is a full nodal solve, so it is an explicit run rather than something recomputed as you type. On an oil well you can also ask the reverse question and have a bean sized for a target rate; that is solved against the nodal point rather than by inverting the correlation at a wellhead pressure you would have had to guess.',
  },
  {
    id: 'coefficients',
    icon: Sigma,
    title: 'Fitting the correlation to your own well',
    content:
      'This is worth more than any published set. Gilbert, Ros, Baxendell, Achong and Pilehvari span a factor of twelve in their leading constant and are not interchangeable; picking one by habit is how a choke calculation goes quietly wrong. The correlation is a power law in every variable, so taking logs makes it linear and the three coefficients fall out of an ordinary least squares on the well tests already sitting on the production spine. Fitting all three needs at least three tests that vary in both gas-liquid ratio and bean size; where they do not, the studio refuses rather than returning coefficients that mean nothing, and offers the field practice instead: hold the exponents at a published set and fit only the leading constant, which works from a single test.',
  },
  {
    id: 'erosion',
    icon: AlertTriangle,
    title: 'The erosional limit',
    content:
      'Once the pressure works, what actually caps a bean size is velocity in the flowline. API RP 14E puts the limit at C over the square root of the mixture density, and the C factor is an input here rather than a constant, because RP 14E is explicit that its own values of 100 and 125 are conservative and permits higher where the fluid is free of sand and corrosion is controlled. Operators routinely run higher on clean, inhibited service. The fluid is taken at wellhead conditions rather than from surface rates, because a gassy stream at 200 psia is a very different fluid from the same stream at 2,000 and the limit turns on its density.',
  },
  {
    id: 'hydrates',
    icon: Snowflake,
    title: 'Cooling across the bean',
    content:
      'Gas expanding through a choke cools, and the wellhead just downstream of a bean is the commonest place in a gas system to make hydrate. The downstream temperature is computed exactly, from the isentropic expansion. Whether hydrate forms there is only SCREENED: the Hammerschmidt form used takes no account of gas composition, which hydrate formation depends strongly on, and a real answer is a flash against a hydrate model with the actual composition. Both of its constants are inputs so a curve for your own gas can be matched, and the verdict is phrased as a risk rather than a fact.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'The production spine and the shared well',
    content:
      'The link earns its keep here more than anywhere else: the well tests it exposes are exactly what the choke coefficients get fitted to. The well itself comes from the shared per-well record, so the trajectory, fluid, inflow and completion are the ones every other production studio is using; the producing conditions this analysis runs at stay with the analysis, because a bean size and a line pressure are what the well was doing on the day rather than what the well is.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What the studio refuses to do',
    content:
      'A bean that produces no operating point is reported as such, with why, rather than given a rate of zero. Subcritical results are marked and kept out of the correlation, not quietly extrapolated. Tests that do not span both gas-liquid ratio and bean size will not be fitted for three coefficients, including the case where the two move together, because collinear data is no more determined than constant data and solving it anyway produces confident-looking numbers that mean nothing. A fit landing outside the published family, or missing its own tests badly, says so. And subcritical two-phase flow is not modelled at all: transcribing the Sachdeva equations from memory is exactly the kind of thing this platform does not do, so the honest screening answer is the critical-flow result marked as out of range.',
  },
];

const ChokeHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((section) => {
      const Icon = section.icon;
      return (
        <AccordionItem key={section.id} value={section.id} className="border-slate-800">
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2 text-left">
              <Icon className="w-4 h-4 text-sky-400 shrink-0" />
              {section.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 leading-relaxed">
            {section.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

export default ChokeHelpContent;
