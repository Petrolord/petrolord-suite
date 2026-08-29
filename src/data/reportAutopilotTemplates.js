// Technical Report Autopilot templates (rebuild, 2026-08-29).
//
// These used to be fetched from a report service on a Heroku host, which no
// longer exists. They are static configuration and never needed a network
// call: keeping them here means the app opens, the brief is fillable and a
// project is saveable even when report generation itself is unavailable.
//
// A section's `brief` is what the generator is told the section must cover.
// It is written as an instruction to a report author rather than as prose, so
// the model has something specific to answer and cannot pad.

export const REPORT_TYPES = [
  {
    id: 'drilling_performance',
    name: 'Drilling Performance Report',
    description: 'How a well or campaign drilled against plan, and what to carry into the next one.',
  },
  {
    id: 'well_test',
    name: 'Well Test Report',
    description: 'Test objectives, sequence, measured rates and pressures, and what they say about the reservoir.',
  },
  {
    id: 'production_review',
    name: 'Production Performance Review',
    description: 'Rates, uptime, losses and well status over a period, against target.',
  },
  {
    id: 'field_development_update',
    name: 'Field Development Update',
    description: 'Progress of a development against the plan: subsurface, wells, facilities, cost and schedule.',
  },
  {
    id: 'hse_performance',
    name: 'HSE Performance Report',
    description: 'Incidents, leading and lagging indicators, and the actions arising.',
  },
  {
    id: 'monthly_operations',
    name: 'Monthly Operations Report',
    description: 'The standing monthly report across production, wells, HSE and cost.',
  },
];

export const REPORT_SECTIONS = {
  drilling_performance: [
    { id: 'exec_summary', name: 'Executive Summary', brief: 'State what was drilled, over what period, how it performed against plan, and the two or three things a reader must know. No new facts beyond those given.' },
    { id: 'objectives', name: 'Objectives and Scope', brief: 'Restate the stated objectives and the boundary of what this report covers.' },
    { id: 'operations', name: 'Operations Summary', brief: 'Narrate the campaign hole section by hole section where the inputs allow, otherwise chronologically. Keep to what the inputs support.' },
    { id: 'performance', name: 'Performance Against Plan', brief: 'Compare the reported KPIs against plan or offset where a plan figure is given. Where no comparator is given, say the comparison could not be made rather than inventing one.' },
    { id: 'npt', name: 'Non-Productive Time', brief: 'Account for NPT: how much, from what, and what it cost in days. If NPT is not among the inputs, say so in one line.' },
    { id: 'lessons', name: 'Lessons Learned', brief: 'Draw lessons that follow from the facts given, each tied to the observation that supports it.' },
    { id: 'recommendations', name: 'Recommendations', brief: 'Give specific, actionable recommendations for the next well. Each must trace to something in this report.' },
  ],
  well_test: [
    { id: 'exec_summary', name: 'Executive Summary', brief: 'State the test objective, what was measured, and the headline interpretation.' },
    { id: 'objectives', name: 'Test Objectives', brief: 'Restate the objectives and the questions the test was meant to answer.' },
    { id: 'programme', name: 'Test Programme and Sequence', brief: 'Describe the sequence actually run: flow and build-up periods, durations, chokes.' },
    { id: 'results', name: 'Results', brief: 'Report the measured rates, pressures and fluid properties given. Do not compute derived reservoir parameters that were not supplied.' },
    { id: 'interpretation', name: 'Interpretation', brief: 'Interpret only what the supplied results support, and name the uncertainty in each reading.' },
    { id: 'recommendations', name: 'Recommendations', brief: 'Recommend next steps for the well and for further data acquisition.' },
  ],
  production_review: [
    { id: 'exec_summary', name: 'Executive Summary', brief: 'State the period, the production outcome against target, and the main driver of any gap.' },
    { id: 'production', name: 'Production Performance', brief: 'Describe rates and cumulative production over the period against target where a target is given.' },
    { id: 'uptime', name: 'Uptime and Losses', brief: 'Account for deferment: how much, from what causes, and where it was concentrated.' },
    { id: 'wells', name: 'Well Status and Interventions', brief: 'Summarise well status changes and interventions over the period.' },
    { id: 'outlook', name: 'Outlook', brief: 'Give the outlook for the next period, stated as an expectation with its assumptions, not a forecast the inputs cannot support.' },
    { id: 'recommendations', name: 'Recommendations', brief: 'Recommend the actions that would most improve the next period.' },
  ],
  field_development_update: [
    { id: 'exec_summary', name: 'Executive Summary', brief: 'State where the development stands against plan on scope, cost and schedule.' },
    { id: 'subsurface', name: 'Subsurface Update', brief: 'Summarise changes in the subsurface understanding over the period.' },
    { id: 'wells', name: 'Wells and Drilling', brief: 'Summarise well delivery against the drilling plan.' },
    { id: 'facilities', name: 'Facilities', brief: 'Summarise facilities progress: engineering, procurement, construction and commissioning as the inputs allow.' },
    { id: 'cost_schedule', name: 'Cost and Schedule', brief: 'Report cost and schedule against plan using the figures given. State clearly where a figure is absent.' },
    { id: 'risks', name: 'Risks and Mitigations', brief: 'Set out the live risks with their mitigations and owners where given.' },
    { id: 'recommendations', name: 'Recommendations', brief: 'Recommend the decisions needed now and by whom.' },
  ],
  hse_performance: [
    { id: 'exec_summary', name: 'Executive Summary', brief: 'State the HSE outcome for the period plainly, including any harm to people.' },
    { id: 'incidents', name: 'Incidents', brief: 'Report incidents factually, without speculating on cause beyond what the inputs establish.' },
    { id: 'indicators', name: 'Leading and Lagging Indicators', brief: 'Report the indicators given and their movement. Do not invent rates that were not supplied.' },
    { id: 'observations', name: 'Observations and Interventions', brief: 'Summarise safety observations and interventions over the period.' },
    { id: 'actions', name: 'Actions and Close-out', brief: 'List the actions arising, their owners and their status where given.' },
  ],
  monthly_operations: [
    { id: 'exec_summary', name: 'Executive Summary', brief: 'One page: production, safety, cost and the exceptions that need a decision.' },
    { id: 'production', name: 'Production', brief: 'Report the month against target and against the previous month where given.' },
    { id: 'wells', name: 'Wells and Interventions', brief: 'Summarise well activity for the month.' },
    { id: 'hse', name: 'HSE', brief: 'Report the month HSE performance factually.' },
    { id: 'cost', name: 'Cost', brief: 'Report spend against budget using the figures given.' },
    { id: 'lookahead', name: 'Look Ahead', brief: 'State what is planned for next month and what it depends on.' },
  ],
};

/** The shape the app's InputPanel expects, assembled once. */
export const REPORT_TEMPLATES = {
  types: REPORT_TYPES,
  sections: REPORT_SECTIONS,
};

/** Section definitions for one report type, in order. */
export const sectionsFor = (typeId) => REPORT_SECTIONS[typeId] || [];

/** The selected sections of a type, in the type's own order, never the click order. */
export const selectedSectionsFor = (typeId, selectedIds = []) => {
  const chosen = new Set(selectedIds);
  return sectionsFor(typeId).filter((s) => chosen.has(s.id));
};
