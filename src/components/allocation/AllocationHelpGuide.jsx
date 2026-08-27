// Production Allocation Studio help content, rendered inside the
// StudioHelp sheet (Production P3).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Gauge, ShieldCheck, Layers, Scale, Sigma, FolderOpen, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What allocation is for',
    content:
      'A facility meters one commingled stream, so the volumes booked against each well are an allocation, not a measurement. This studio distributes the metered total across the wells in proportion to what each was capable of producing: its latest valid well test, scaled by the hours it was actually on. Theoretical rate times uptime gives each well its share; the metered total divided by the sum of those shares is the allocation factor; every well is then credited with its share times that factor.',
  },
  {
    id: 'totals',
    icon: Gauge,
    title: 'Metered totals: where allocation starts',
    content:
      'The Data tab takes the facility, separator or export meter reading, one row per date with no well column. It is deliberately a different data class from the per-well ledger, which in a commingled field is itself an allocation. Column names are alias-matched, units auto-scale from the header, and re-importing a corrected meter file overwrites the same dates rather than duplicating them. You can also type a single date in by hand.',
  },
  {
    id: 'tests',
    icon: ShieldCheck,
    title: 'Well test QC',
    content:
      'Allocation is only as good as the tests behind it, so every test is checked against data the spine already holds: the well’s own test history (an oil rate far off its median is flagged), the daily ledger on the test date (compared on a producing-day basis, so a part-day well is judged fairly), the ledger watercut, the test duration, and whether it recorded any flow at all. Accepting or rejecting a test writes the QC flag to the spine, so the verdict holds everywhere, not just in this session. A rejected test carries no well, and the next valid test before it takes over.',
  },
  {
    id: 'basis',
    icon: Layers,
    title: 'Choosing the basis',
    content:
      'Well test times uptime is the standard basis: each well is carried by the test in force on that date, scaled by hours on stream. Prorate the wells own meters is for fields where each well is metered and the job is reconciling those meters to the facility total. Either way, a well with no basis takes no allocation and the run says so rather than inventing a rate for it. A test stops carrying its well once it is older than the validity you set, which is what stops a stale test from quietly propping up a well that has changed.',
  },
  {
    id: 'factors',
    icon: Sigma,
    title: 'Reading the factor',
    content:
      'A factor of 1.0 means the wells’ tests add up to exactly what the facility measured. Above 1.0 the meter saw more than the tests can explain; below it the tests promise more than the facility received. Nothing is ever clamped to 1.0: a factor drifting away from it is the signal that the tests, the meter or the uptime record disagree, and hiding it would hide the only evidence you have. Factors outside the warning band are flagged in the diagnostics with their dates.',
  },
  {
    id: 'reconcile',
    icon: Scale,
    title: 'Reconciliation',
    content:
      'The Reconciliation tab plots what the meter saw against what the wells booked between them, per phase, with the difference as bars. A steady offset usually points at a meter calibration or an unmetered stream; a spiky one usually points at test or uptime data. The summary line gives the period totals and the percentage.',
  },
  {
    id: 'writeback',
    icon: AlertTriangle,
    title: 'The two write-backs',
    content:
      'Save factors writes one row per well per month to the spine, where the next run and every downstream app can read it. Book to ledger writes the allocated volumes into the daily production ledger, stamped as allocation, which overwrites the production rows for those wells and dates. Both are deliberate actions behind a confirmation, never a side effect of running an allocation, because booking replaces whatever measurement was there before.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Projects and auto-save',
    content:
      'A project holds your analysis state: the field, the period, the basis and thresholds. It does not hold the production data, the metered totals or the factors, which live in the shared spine. Auto-save runs about 10 seconds after each change once a project is open, and the header indicator shows the last save. Two engineers can allocate the same field on different assumptions and compare, because only the assumptions are private.',
  },
];

const AllocationHelpContent = () => (
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

export default AllocationHelpContent;
