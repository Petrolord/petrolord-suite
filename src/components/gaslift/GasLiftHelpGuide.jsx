// Gas Lift Design Studio help content, rendered inside the StudioHelp
// sheet (Production P4).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Target, Ruler, Wrench, ArrowDownToLine, TrendingUp, Link2, FolderOpen, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio designs',
    content:
      'A continuous gas-lift installation: where the valves go, what each one is set at, how the well unloads through them, and how much the well makes once it is on the operating valve. The starting point is a well that will not flow because the column in the tubing is too heavy. Injection gas lightens that column, and the deeper the gas goes in the more of the column it lightens, so almost every question in gas-lift design comes back to how deep the available casing pressure can reach.',
  },
  {
    id: 'injection-point',
    icon: Target,
    title: 'The point of injection',
    content:
      'Pressure across, depth down. The injection line is the real-gas casing gas column falling from the surface injection pressure; it is computed with local temperature and compressibility at every step, not a flat rule of thumb. The flowing gradient is the lifted tubing traverse drawn down from the wellhead at the design rate. Where the injection line, less the transfer differential, meets the flowing gradient is the deepest point gas can be put in. Raise the operating pressure and the point goes deeper; raise the wellhead pressure or the design rate and it comes back up.',
  },
  {
    id: 'spacing',
    icon: Ruler,
    title: 'Valve spacing',
    content:
      'The top valve sits where the injection line first overcomes a full column of kill fluid. Every valve below it sits where the injection line, decremented by the design pressure drop per valve, still beats the tubing pressure at the valve above by the transfer differential, with kill fluid in between. Two conventions are offered: decreasing surface pressure, which is what makes upper valves close as the point of injection moves down, and constant surface pressure, which relies on the transfer differential alone. Spacing stops at the injection point, the packer, the minimum spacing or the valve limit, and the studio says which of those stopped it.',
  },
  {
    id: 'valves',
    icon: Wrench,
    title: 'Valve settings and the test rack',
    content:
      'A bellows valve is a nitrogen dome acting on a stem and port. It opens when the casing pressure (an injection-operated valve) or the tubing pressure (a production-operated valve) overcomes the dome, and closes when the pressure on the bellows falls back to the dome pressure. The difference between those two is the valve spread, which grows with the port-to-bellows area ratio R. The shop sets a valve on a bench at 60 F, so the dome charge is converted between valve temperature and bench temperature by the fixed-volume real-gas nitrogen relation, not the linear rule printed in older manuals. The number the shop dials is the test rack opening pressure in the valve sheet.',
  },
  {
    id: 'unloading',
    icon: ArrowDownToLine,
    title: 'Unloading and multipointing',
    content:
      'Unloading is the transfer from valve to valve as the fluid level is pushed down. At each stage the casing is on that valve\'s opening pressure and every valve above it should have shut. A valve that has not shut is multipointing: the gas splits between two depths, the deeper valve never carries its design rate, and the well settles above its design injection depth. Because a valve closes at its dome pressure, the surface pressure drop per valve has to exceed the valve spread; if it does not, the Unloading tab names the valves that stay open. The fixes are a larger drop per valve or a smaller port.',
  },
  {
    id: 'performance',
    icon: TrendingUp,
    title: 'Performance and how much gas to buy',
    content:
      'The response curve solves a full nodal operating point at each injection rate, with the string marched in two segments: the native gas-oil ratio below the injection point and the lifted ratio above it. Added gas first lightens the column and the rate rises, then friction from the extra gas takes over and the rate flattens and falls. The maximum-rate point is the top of that curve; the economic point is where the incremental response drops below the stb per Mscf you set, which is normally the number worth designing to. Each point is a full solve, so the curve runs when you ask for it rather than on every keystroke.',
  },
  {
    id: 'link',
    icon: Link2,
    title: 'Linking to the production spine',
    content:
      'A design can be attached to a well on the po_* production spine. The link stores ids only, and picking a well lets you apply its latest valid test to the design rate, water cut, wellhead pressure and gas-oil ratio rather than retyping them. Water cut and gas-oil ratio are computed from the test rates, so they always match the test they came from. Nothing about the link changes the design math, and a design works perfectly well with no link at all.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this does not do',
    content:
      'The valve geometry shipped here is the generic 1 inch and 1.5 inch bellows the literature works in, not a vendor catalog: bellows area and R vary by manufacturer, so set every valve from the sheet for the valve actually run. Throughput is Thornhill-Craver, the industry convention for what a port passes, which is known to be optimistic for a valve whose stem restricts the flow. The design is for continuous lift; intermittent lift, chamber lift and plunger-assisted lift are not covered. Dual-string and annular-flow installations are out of scope.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Projects and auto-save',
    content:
      'A project holds the whole design: the well model, the injection settings and the spacing settings. Auto-save runs about 10 seconds after each change once a project is open, and the header indicator shows the last save. The valve sheet exports as CSV and every chart exports as a PNG, so a design can leave the studio as a document.',
  },
];

const GasLiftHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map(({ id, icon: Icon, title, content }) => (
      <AccordionItem key={id} value={id} className="border-slate-800">
        <AccordionTrigger className="text-left text-sm hover:no-underline">
          <span className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-amber-400 shrink-0" />
            {title}
          </span>
        </AccordionTrigger>
        <AccordionContent className="text-sm text-slate-400 leading-relaxed">
          {content}
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

export default GasLiftHelpContent;
