// Production Surveillance Studio help content, rendered inside the
// StudioHelp sheet (Production P2).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Database, FolderOpen, AlertTriangle, LineChart, Clock, TrendingDown, Users, Link2,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Surveillance is the daily loop: look at what every well produced, find the wells that moved against their own recent history, explain the gap, and record the downtime behind it. This studio does that over a shared production data spine. Rates, watercut, GOR, uptime, exceptions, deferments and decline overlays all read the same ledger, so the numbers you see here are the numbers the Allocation Studio and the lift studios work from.',
  },
  {
    id: 'fields',
    icon: Users,
    title: 'Fields: the shared container',
    content:
      'Everything hangs off a field. Create one in the left rail, then import into it. A field is private to you until you share it, and sharing is read-only for the rest of your organization: colleagues see the wells, ledger, tests and deferments, and only you can change them. Deleting a field deletes all of its production data, so it asks first.',
  },
  {
    id: 'import',
    icon: Database,
    title: 'Importing production data',
    content:
      'The Data tab takes two CSV shapes: a daily (or monthly) ledger of one row per well per date, and well tests of one row per test. Column names are matched against a wide alias table, units auto-scale from the header (Mscf, MMscf, Bscf, bbl, Mbbl), and every row that is skipped or adjusted is listed in the import report. Nothing fails silently. Volumes are stored as stb and Mscf. Re-importing a corrected file overwrites the same well-dates in place rather than duplicating them, and monthly rows land on the first of their month. Download the template if you want the exact canonical schema.',
  },
  {
    id: 'wells',
    icon: Link2,
    title: 'Wells and the registry link',
    content:
      'Wells are created from the well column of your first import, keeping the label exactly as it appears in your file. Set each well type: producers are surveilled on oil rate, watercut, GOR and hours on stream, injectors on injection rate. Where a well matches the suite wells registry (by UWI first, then by name, ignoring case, separators and leading zeros) the studio offers to link it. Linking is by id, so downstream apps join production to subsurface data safely. Ambiguous names are never linked automatically.',
  },
  {
    id: 'exceptions',
    icon: AlertTriangle,
    title: 'Exception surveillance',
    content:
      'The Overview tab compares each well against its own recent baseline and flags shut-ins, rate drops, injection drops, watercut rises, GOR rises, downtime and stale data. Windows anchor on the latest date in the field ledger, never on today, so a historical dataset surveils honestly. On monthly data the windows widen automatically rather than compare a single month against a single day. Wells whose baseline rate is below the minimum rate setting skip the ratio checks, which keeps marginal wells from generating noise. Every threshold is yours to set in the left rail and travels with the saved project, so two engineers can surveil the same field with different triggers.',
  },
  {
    id: 'trends',
    icon: LineChart,
    title: 'Trends',
    content:
      'Plot the field total or a single well: oil, water and gas rates, watercut and GOR, or injection. Gas rides the right axis so it never flattens the liquid lines. Smoothing averages over real elapsed days rather than a point count, so daily and monthly ledgers behave the same. On a well view you can switch to producing-day rates, which divide volumes by hours on stream; days with zero hours are shut in and drop out rather than reading as zero rate. Any chart downloads as a PNG from the button in its corner.',
  },
  {
    id: 'deferments',
    icon: Clock,
    title: 'Deferments and downtime',
    content:
      'Record downtime events against a well with a start date, an optional end date, a cause category and the volumes deferred. Open events stay open and accrue days to the latest ledger date. The loss-by-cause table rolls events up by category so the pattern becomes visible: whether the field is losing more to surface facility trips than to well problems, and what that costs in barrels.',
  },
  {
    id: 'decline',
    icon: TrendingDown,
    title: 'Decline overlay',
    content:
      'The Decline tab fits a well through the same Arps engine the DCA Studio uses, on a semi-log rate plot with the forecast extended past the history. It is a surveillance sanity check: is this well still on its trend, or has it stepped off it? Under three usable points there is no fit and the studio says so instead of drawing a curve. Segmented fits, type curves and probabilistic EUR belong in the DCA Studio, which is one click away from that tab.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Projects and auto-save',
    content:
      'A project holds your analysis state: which field you were looking at, your exception thresholds, and your trend and decline picks. It does not hold the production data itself, which lives in the shared spine. Auto-save runs about 10 seconds after each change once a project is open, and the header indicator shows the last save. Click it to save immediately.',
  },
];

const SurveillanceHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map(({ id, icon: Icon, title, content }) => (
      <AccordionItem key={id} value={id} className="border-slate-800">
        <AccordionTrigger className="text-left text-sm hover:no-underline">
          <span className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-sky-400 shrink-0" />
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

export default SurveillanceHelpContent;
