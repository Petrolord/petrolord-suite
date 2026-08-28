// Artificial Lift Advisor help content (Production P9).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Scale, Cpu, GitCompare, Link2, ExternalLink, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this advisor does',
    content:
      'It answers which lift method to put on a well, and it answers it twice. First by screening: a rules matrix over six methods, the kind of judgement an experienced production engineer applies in a minute. Then by design: it actually runs the validated design chain for each of the four methods this Suite can design, against the same well, and reports what each would need and whether it works at all. The second answer is the one worth having, and the studio is built so you can see both and see where they differ.',
  },
  {
    id: 'screening',
    icon: Scale,
    title: 'The screening layer',
    content:
      'Six methods: gas lift, ESP, rod pump, plunger lift, progressing cavity and jet pump. Every deduction is a rule of thumb spelled out so it can be argued with rather than hidden inside a score, and the reasons are the output that matters more than the number. The score exists to rank, not to measure: anything within fifteen points of the leader that also clears fifty is marked worth designing, because a screening score is not precise enough to separate close candidates and pretending otherwise is the whole problem with scoring.',
  },
  {
    id: 'design',
    icon: Cpu,
    title: 'The design layer',
    content:
      'For gas lift, ESP, rod pump and plunger lift the advisor runs the real thing: the same validated engines the four studios use. An ESP gets a reference stage picked for its in-situ duty and a motor picked for the shaft load that produces. Gas lift gets the deepest injection point the available surface pressure can actually reach, then the well solved lifted at that point. A rod pump walks a ladder of six equipment combinations and takes the smallest that meets the target without overloading the rods. A plunger is judged on the gas-liquid ratio a cycle really needs, computed rather than screened. All four run against ONE well description, which is what makes comparing them mean anything.',
  },
  {
    id: 'screening-grade',
    icon: AlertTriangle,
    title: 'Why this is screening grade',
    content:
      'Every method needs equipment chosen before it can be designed, and the advisor chooses from a short ladder rather than asking you for forty numbers. That is a deliberate trade: what this pass is good for is telling you which methods can work on this well at all, and roughly what each would cost you in equipment. It is not a design. Every result names exactly what equipment it used and carries a link into the studio that designs the thing properly, with the well already loaded.',
  },
  {
    id: 'disagree',
    icon: GitCompare,
    title: 'When the two disagree',
    content:
      'This is the most useful thing the advisor produces. A method the matrix likes that the engine refuses is a rule of thumb meeting a well it does not fit; a method the matrix was lukewarm about that designs cleanly is worth a second look. Both are called out by name rather than quietly resolved. When they conflict the design wins, for the simple reason that it solved the well and the matrix applied a rule. That is the same discipline the Gas Well Performance Studio uses when the plunger-lift rule of thumb disagrees with the computed gas requirement.',
  },
  {
    id: 'noengine',
    icon: AlertTriangle,
    title: 'The two methods that are screened only',
    content:
      'Progressing cavity and jet pumps have no validated engine in this Suite, so for them the screening is all there is, and each says so on its own card. They are listed because leaving a genuine option out of a lift comparison would be worse than saying plainly what is known about it. A progressing cavity pump is the best thing in the world in heavy viscous crude and the screening will tell you so; it just will not tell you how many stages.',
  },
  {
    id: 'shared',
    icon: Link2,
    title: 'One well, four methods',
    content:
      'This studio is the reason the shared per-well record exists. Comparing lift methods is meaningless if each studio holds its own description of the well, so trajectory, temperatures, fluid, inflow and completion come from one record that every production studio reads and writes. What does NOT go in that record is the duty or the facility: a target rate is a decision and a compressor is a facility, and neither is a property of the well. Changing them here never rewrites the field record for anyone else.',
  },
  {
    id: 'handoff',
    icon: ExternalLink,
    title: 'Handing off to a studio',
    content:
      'Each method that has an engine carries a link to the studio that designs it. The link takes the linked well with it, so the studio opens already pointed at the same well rather than making you find it again. From there you are in a full design tool: the Gas Lift Design Studio spaces valves and sets dome charges, the ESP Design Studio stages against a vendor curve, the Rod Pump Design Studio solves the wave equation and checks the rods against modified Goodman, and the Gas Well Performance Studio designs the plunger cycle.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What the advisor refuses to do',
    content:
      'A target at or above the inflow’s absolute open flow is refused outright, because no lift method makes a well produce more than it can deliver and any answer to that question would be a lie. A rod pump design that runs cleanly but delivers a third of the target is reported as a shortfall, not as a success — reporting it as workable would be the single most misleading thing this advisor could do. A gas well record is refused, because this pass designs lift for an oil well. And a method with no engine is never presented as though it had been designed.',
  },
];

const LiftAdvisorHelpContent = () => (
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

export default LiftAdvisorHelpContent;
