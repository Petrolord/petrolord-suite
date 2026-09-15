// Technical Report Autopilot help guide (EC6-1).
//
// This app had no help guide at all, which is how it came to be the one
// place in the module where a user could put invented figures into a
// document without being told. What it says here is what the code does: the
// prose is written by a language model, the figures are whatever you typed,
// and neither is checked against anything.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, FileText, Gauge, AlertTriangle, Download, Bot } from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this app is for',
    content:
      'It drafts the prose of a routine technical report from a brief you fill in: a report type, the period, your objectives, the figures you measured and any notes or attached text. It is a drafting tool. It does not read your data, it does not compute anything, and nothing in the report is validated against another app in the Suite.',
  },
  {
    id: 'model',
    icon: Bot,
    title: 'The words are written by a language model',
    content:
      'Every section is written by an OpenAI model from the brief you gave it. The same brief will not produce the same words twice, so two runs of the same report differ in wording. That is the nature of the tool and the reason the app is not a system of record: keep the report you approved, not the button that made it.',
  },
  {
    id: 'figures',
    icon: Gauge,
    title: 'Your figures are passed through as facts',
    content:
      'The KPI list goes to the model under the heading "Reported figures", and the model writes them into the report as measurements. It has no way to tell a measured value from a placeholder. Until September 2026 the brief arrived pre-filled with an average rate of penetration of 150 ft/hr and 5 percent non-productive time against a well called A-21, so anyone who pressed Generate without clearing the form got a report stating two invented numbers as fact. The form starts empty now. Check every figure in the draft against the source you took it from before the report leaves your hands.',
  },
  {
    id: 'length',
    icon: FileText,
    title: 'Sections, detail level and the page cap',
    content:
      'Pick a report type and the sections it carries. Detail level sets how much is written per section, and Max Pages holds the whole document to roughly that many pages by sharing the page budget across the sections you picked. Before September 2026 it bounded each section against a third of the page budget instead, so twelve detailed sections came to about sixteen pages whatever the cap said. A page is taken as roughly 450 words of report prose.',
  },
  {
    id: 'export',
    icon: Download,
    title: 'Exporting',
    content:
      'The draft exports as a Word document assembled in your browser. Edit it there: this app has no revision history, and regenerating a section replaces it.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'No engineering calculation happens in this app, so nothing it writes is an engineering result. There is no live connection to the other Suite apps, no citation of a source and no check that a number you typed is consistent with anything else you have entered. A section that reads convincingly can still be wrong, and the responsibility for every figure in the finished report is yours.',
  },
];

export const ReportAutopilotHelpContent = () => (
  <Accordion type="single" collapsible className="w-full" defaultValue="what">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem key={item.id} value={item.id} className="border-slate-800">
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

const ReportAutopilotHelpGuide = () => (
  <StudioHelp
    title="Technical Report Autopilot"
    description="What the model writes, what it takes on trust from you, and what this app does not do."
  >
    <ReportAutopilotHelpContent />
  </StudioHelp>
);

export default ReportAutopilotHelpGuide;
