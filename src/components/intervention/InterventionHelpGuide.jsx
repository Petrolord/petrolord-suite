// Well Intervention Planner help content (Production P12).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Activity, Ban, TrendingUp, DollarSign, Link2, AlertTriangle, Sigma,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It answers three questions in the order they actually come in. What is wrong with this well? Which treatments could address that, and which could not? And what is the one you pick actually worth? The order matters more than any of the individual answers, because the second question is decided by the first, and a plan that skips it is a plan that recommends the wrong treatment about half the time.',
  },
  {
    id: 'gate',
    icon: Ban,
    title: 'The diagnosis decides the treatment',
    content:
      'This is the idea the whole studio turns on. Water channelling and water coning look identical on a water-cut plot and need OPPOSITE treatments. Channelling -- behind pipe, a thief zone, a fracture, a high-permeability streak -- is a plumbing problem, and a squeeze or a gel has somewhere to go and something to seal. Coning is not a plumbing problem: the water is coming through the same rock as the oil, pulled up by the drawdown, and there is nothing to squeeze. Shut off the bottom perforations and the cone re-forms above them; the treatment buys weeks and costs whatever it costs. So the screening here is GATED by the diagnostic. On a coning well the shutoff is ruled out with the reason, and reducing drawdown -- useless everywhere else -- becomes the candidate. And when the mechanism cannot be established, the shutoff is ruled out too, because a treatment chosen by guesswork is worse than no treatment.',
  },
  {
    id: 'chan',
    icon: Activity,
    title: 'How the mechanism is read',
    content:
      'Chan (SPE 30775) separates these mechanisms by the shape of the water-oil ratio and its derivative on a log-log plot. The SHAPES are the published content and they are not transcribed here. What this studio does is read the same two things Chan reads -- the trend of the ratio and the sign and steepness of its derivative -- with every threshold shown and adjustable. A falling derivative is coning; that is the firm end of the reading, because a falling derivative is qualitatively different from a rising one and the sign carries it. A steeply climbing derivative is channelling. Between the two is ordinary displacement, which is not a well problem at all. Take a decision that turns on it to the actual plots.',
  },
  {
    id: 'weak',
    icon: AlertTriangle,
    title: 'Where the reading is weak, said out loud',
    content:
      'The boundary between ordinary displacement and channelling is the soft part, and it is worth knowing why. For ANY power-law history the ratio and its derivative have the same log-log slope, because differentiating a t^m against log time just multiplies it by m. So the two pictures cannot be separated by comparing their slopes to each other; the only thing that separates them is how STEEP the climb is, and steady arrival sits around a slope of one. A reading close to that boundary is reported as close to it rather than resolved, and the confidence drops accordingly. The coning end has no such problem.',
  },
  {
    id: 'derivative',
    icon: Sigma,
    title: 'The derivative, and the points that are thrown away',
    content:
      'The derivative is the Bourdet three-point weighted difference from the well test module -- the same validated implementation, not a second one, because a daily production history is exactly the noisy log-time series it was designed for. Three things are discarded before it runs. Shut-in days, because a day with no oil has nothing to say about the water mechanism and an infinite ratio poisons the derivative either side of it. Outliers, counted rather than removed silently. And the FIRST AND LAST few derivative points: Bourdet needs a neighbour at least a fixed log distance away on both sides, and at the ends of a series there is only one, so it falls back to a one-sided slope that on a curving response is badly biased. On the gated test case the very first point reads a derivative four times too large, and keeping it drags the measured exponent from 1.56 down to 1.32, which would put a genuinely steep channelling history right on the classifier boundary.',
  },
  {
    id: 'uplift',
    icon: TrendingUp,
    title: 'Why the uplift is a nodal solve and not a multiplier',
    content:
      'Removing skin changes the INFLOW. It does not change the well by the same factor, because the extra rate then has to go up the same tubing and the friction loss goes up with it. So a stimulation that doubles the productivity index does not double the well, and a spreadsheet that applies the productivity multiplier to the current rate over-promises -- always, and by more on a well whose tubing is already working hard. The studio shows both numbers and the gap between them. Removing WATER is stranger and more interesting. It barely touches the inflow and changes the outflow a great deal: less water is a lighter column, and a lighter column means a lower bottomhole pressure for the same wellhead pressure, so the well slides down its own inflow curve to a higher rate. That gain lives entirely in the tubing and no inflow calculation will find it. On a well close to dying it is the difference between flowing and not.',
  },
  {
    id: 'economics',
    icon: DollarSign,
    title: 'The economics, and the number with no default',
    content:
      'The cash flow is the Suite\'s canonical screening economics engine, imported rather than rewritten, so an intervention here discounts the same way every other screening number in the platform does -- mid-year, by documented convention. The uplift DECLINES, and the decline rate is a required input with no default. That is deliberate: an intervention modelled as a permanent step change is an intervention that always pays, and it is the commonest way a workover case gets oversold. There is no defensible default because the answer depends on what was done and to what. For full fiscal terms rather than a screening number, take the case to the Petroleum Economics Studio.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'What it needs from the rest of the module',
    content:
      'More than any other studio here. The production history comes from the spine, and without one there is no diagnosis and every water treatment is ruled out for want of it -- which is the correct behaviour and worth seeing. The well description comes from the shared per-well record, so the trajectory, fluid, inflow and completion are the ones every other production studio is designing against. What the well is producing today stays with the plan, because a water cut on the day is not a property of the well.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What this studio refuses to do',
    content:
      'It will not recommend a water shutoff without a diagnosis, on any water cut. It will not size a treatment the diagnostic has ruled out, because sizing a bad idea to four decimal places does not improve it. It will not accept a target skin below what the geometry allows: at that point the productivity index goes infinite, which is the equation running out rather than an aggressive design, and a screening tool that returned a spectacular uplift there would be worse than useless. It will not value an uplift without a stated decline. And it does not infer skin from production data, because skin is a pressure transient measurement and nothing else gives you one.',
  },
];

const InterventionHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem key={item.id} value={item.id} className="border-slate-800">
          <AccordionTrigger className="text-sm hover:no-underline text-left">
            <span className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
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

export default InterventionHelpContent;
