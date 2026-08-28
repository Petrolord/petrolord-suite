// Production Network Studio help content (Production P11).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Waypoints, TrendingDown, Gauge, Link2, Sigma, AlertTriangle, Activity,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does that no other one can',
    content:
      'Every single-well studio in this platform -- nodal, gas lift, ESP, rod pump, gas well, choke, flow assurance -- solves one well against a wellhead pressure that somebody typed in. That is the right thing to do when you are designing a completion. It is the wrong thing to do when you are asking what a field makes, because in a real gathering system nobody types the wellhead pressure in: the header pressure is whatever the trunk line needs to carry the total, and the total is the sum of what the wells make at that header pressure. So the wells set the pressure that holds the wells back. Open a new well into a header and every well already on it makes less. Quantifying that, per well, in barrels, is what this studio is for.',
  },
  {
    id: 'solve',
    icon: Sigma,
    title: 'How the solve works',
    content:
      'The unknowns are the pressures at every well and junction; the delivery point is a fixed-pressure boundary; and there is one equation per unknown, which is mass balance at that node. Newton drives all of them to zero at once. The solver itself lives in the engine package and knows nothing about petroleum: it takes the branch relations as callbacks, which is what lets it be checked against a case with a closed form. Hand it linear resistances and the whole network collapses to a weighted graph Laplacian whose answer is a matrix inverse, and Newton iteration has to reproduce that to machine precision. It does. The nonlinear cases are checked against a separate implementation that forms no Jacobian and solves no linear system at all, but bisects each node in turn.',
  },
  {
    id: 'relations',
    icon: Activity,
    title: 'Where the branch relations come from',
    content:
      'Both are the Suite\'s already-validated nodal layer rather than anything new. A WELL is its inflow met against its own tubing, sampled by marching UP from the inflow: pick a rate, ask the IPR what bottomhole pressure that draws it down to, march the tubing to the wellhead. One traverse per sample, and it gives deliverability against wellhead pressure directly, which is exactly the curve a network wants. A PIPE is the same two-phase traverse the wellbore uses, marched horizontally or up a rise, sampled at a set of rates. Both become characteristic curves and are handed to the solver as fast monotone interpolations, because solving a traverse inside every Newton evaluation would mean thousands of them.',
  },
  {
    id: 'unstable',
    icon: AlertTriangle,
    title: 'The unstable branch, and why part of every well curve is thrown away',
    content:
      'A tubing curve is not monotone. At low rate the liquid holds up, the column is heavy, and the wellhead pressure the well can hold is LOW. As rate rises the column lightens and that pressure rises with it, until friction takes over and it falls again. So the curve has a peak, and everything to the left of it is the classic unstable branch: a well sitting there does not hold a rate, it heads, or it loads up and dies. That branch is dropped rather than offered to the solver, because it is not an operating point. The peak is reported instead, as a rate below which the well is unstable -- and a well whose network operating point sits close to it is a well about to start heading, which no single-well study would have said because no single-well study knew what the header was going to do.',
  },
  {
    id: 'mixing',
    icon: Waypoints,
    title: 'Why the header water cut is not the average of the well water cuts',
    content:
      'Component rates add; ratios do not. A header fed by a well at 10 percent water and one at 80 percent is not at 45 percent. It is at whatever the RATES make it, and if the dry well is three times the size the answer is nearer 27. Everything in this studio is carried as mass and as component rates for exactly that reason, and the water cut and gas-oil ratio you see on a line are consequences rather than inputs. That also matters to the answer and not just the reporting, because a line\'s pressure drop depends on what is in it: the mixtures are solved in an outer loop, pushed down the flow directions the pressures produced, and the lines re-characterised until nothing moves.',
  },
  {
    id: 'alone',
    icon: TrendingDown,
    title: 'What "alone" means in the well table',
    content:
      'It is solved on the SAME network with the other wells shut in, not by a separate single-well calculation. That is the whole reason the comparison means something: the flowline, the trunk, the delivery pressure, the correlation and even the interpolation error in the curves are identical on both sides, so the difference between the two columns is the other wells and nothing else. A number produced by running a different tool with different assumptions would not support the same claim.',
  },
  {
    id: 'bottleneck',
    icon: AlertTriangle,
    title: 'The bottleneck is not the biggest pressure drop',
    content:
      'It is the line burning the most pressure for what it carries. A trunk carrying everything is supposed to have the biggest drop; that is its job, and pointing at it every time would be useless advice. A short flowline burning nearly as much to move a tenth as much is the one worth changing, and it is usually far cheaper to change. Both numbers are shown so the difference is visible rather than taken on trust.',
  },
  {
    id: 'separator',
    icon: Gauge,
    title: 'The separator pressure sweep',
    content:
      'Usually the one thing an operator can actually change tomorrow, so it gets its own tab. Each point is a whole network solve. The rate gained per psi is read off the curve rather than quoted as a constant, because it is not one: it steepens wherever a well that had been held off the header comes back on, and those steps are the interesting part rather than noise to smooth away.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'The shared well records',
    content:
      'This is the studio the shared per-well record was built for. Every well studio in this module saves its well description -- trajectory, fluid, inflow, completion -- to the same record on the production spine. Point this studio at a field and it reads all of them at once and puts them on a header, so a field described well by well across six different studios becomes a network here without being retyped. What the wells are FLOWING today stays with the network rather than going into the shared record, because a water cut on the day is not a property of the well.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What this studio refuses to do',
    content:
      'A node with no route to the delivery point is a drawing mistake, and it is named rather than quietly ignored: solving around it would give a confident answer about a system that does not exist. A well that will not flow to surface at any rate its inflow allows is reported as such rather than given a curve. Compressors, pumps and separators are NOT modelled: the node types here are wells, junctions and a delivery point, because a compressor in a network solve needs a real machine curve and inventing one would be worse than leaving it out. Line temperatures are inputs here rather than solved -- solving them is what the Flow Assurance Studio does, one line at a time and in far more detail than a network solve needs, and taking a number from there and typing it here is the honest way round.',
  },
];

const NetworkHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem key={item.id} value={item.id} className="border-slate-800">
          <AccordionTrigger className="text-sm hover:no-underline text-left">
            <span className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-sky-400 shrink-0" />
              {item.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 leading-relaxed">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

export default NetworkHelpContent;
