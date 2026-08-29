// Flow Metering Designer help content (Facilities F12).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Sigma, TrendingDown, Ruler, Scale, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Sizes an orifice meter run and, more importantly, computes how well the resulting measurement is actually known. The flow equation is the easy half. What a custody transfer argument is about is the uncertainty, and which term in it is worth spending money to improve.',
  },
  {
    id: 'cd',
    icon: Sigma,
    title: 'The discharge coefficient is not 0.61',
    content:
      'The Reader-Harris/Gallagher equation gives the discharge coefficient as a function of the beta ratio, the Reynolds number and the tapping arrangement, and across the practical range it spans about seven percent. That is many times the uncertainty anybody disputes in a measurement argument, so it is worth computing rather than assuming. The studio draws it against Reynolds number so you can see it move.',
  },
  {
    id: 'uncertainty',
    icon: Scale,
    title: 'The uncertainty budget is the point',
    content:
      'Every input carries an uncertainty, and the flow equation gives each one a sensitivity: the bore enters squared and again through the beta term, the differential and the density enter as square roots, the coefficient enters directly. The studio propagates them all and names the dominant term, because that is the actionable part. A more precisely bored plate buys nothing at all when the differential transmitter dominates the budget, and knowing which is which is the difference between spending money well and spending it for comfort.',
  },
  {
    id: 'turndown',
    icon: TrendingDown,
    title: 'Turndown, and the most misunderstood thing in gas measurement',
    content:
      'A differential transmitter is accurate to a fixed fraction of its SPAN. As the reading falls, that fixed absolute error becomes a larger and larger fraction of the reading. At ten to one turndown a transmitter quoted at 0.075 percent of span contributes 0.75 percent of reading, which swamps everything else in the budget. This single fact is why an orifice run has a usable turndown of about three to one, and why the answer to a wide flow range is a second transmitter on a lower span or a different meter type, not a better plate.',
  },
  {
    id: 'run',
    icon: Ruler,
    title: 'The meter run itself',
    content:
      'An orifice measures correctly only in a fully developed, swirl-free profile, which is why the standards specify straight lengths upstream and downstream that depend on the beta ratio and on what fitting is upstream. Two elbows in different planes are the worst case by a wide margin because they induce swirl that takes a very long run to decay. Those requirements are published table values rather than a calculation, the studio says so, and a flow conditioner shortens them substantially.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this does not do',
    content:
      'No AGA-8 compressibility (bring your own density), no ultrasonic or Coriolis meter models, no proving calculations beyond applying a meter factor, and no wet-gas correction. The orifice correlation is published for a beta between 0.1 and 0.75 and the studio refuses to pretend outside it. Use this to specify a run and argue about its uncertainty, not to replace a measurement engineer.',
  },
];

const MeterHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => (
      <AccordionItem key={item.id} value={item.id}>
        <AccordionTrigger className="text-sm text-left">
          <span className="flex items-center gap-2">
            <item.icon className="w-4 h-4 text-emerald-400 shrink-0" />
            {item.title}
          </span>
        </AccordionTrigger>
        <AccordionContent className="text-sm text-slate-400 leading-relaxed">
          {item.content}
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

export default MeterHelpContent;
