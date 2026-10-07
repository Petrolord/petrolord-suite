// The public face of the app catalogue: the homepage and the Solutions page
// both read this file, so there is one list to keep honest.
//
// WHAT IS COUNTED (docs/scope/Homepage-Counts.md): a live app is a tile a
// customer can open today, meaning a master_apps row with status 'Active',
// is_built and is_functional, whose route is on main. Checked against the
// database on 2026-10-05: 104 apps across 10 modules, every one routed in
// src/App.jsx; 105 from 2026-10-07 with the QI Studio tile (migration
// 20261007130000). The snapshot is src/data/__fixtures__/live-catalogue.json and
// the guard test compares these lists with it name by name. When an app goes
// live or is retired, change its module's list here and refresh the snapshot
// in the same PR; the counts on both pages are derived from these lists,
// never typed by hand.
//
// Slugs match modules.slug and the /dashboard/<slug> hub routes, and are the
// keys of MODULE_PRICING, so the price shown beside a module is the one the
// quote charges.

export const SUITE_MODULES = [
  {
    slug: 'geoscience',
    name: 'Geoscience & Analytics',
    short: 'Geoscience',
    tagline: 'From seismic to volumes in place.',
    description:
      'Seismic interpretation in 2D and 3D, well data and petrophysics, correlation, stratigraphy, mapping, pore pressure, rock physics, basin modelling and volumetrics. Wells, tops and surfaces are published to shared registries, so each studio picks up where the last one stopped.',
    apps: [
      'Seismolord',
      'Well Data Manager',
      'Petrophysics Studio',
      'Well Correlation',
      'Stratigraphy Studio',
      'Mapping & Surface Studio',
      'Pore Pressure Studio',
      'Rock Physics Studio',
      'QI Studio',
      'Earth Modeling',
      'Basin & Charge Modeling',
      'ReservoirCalc Pro',
      'Wellsite Studio',
    ],
  },
  {
    slug: 'reservoir',
    name: 'Reservoir Management',
    short: 'Reservoir',
    tagline: 'Understand the reservoir and plan its recovery.',
    description:
      'Fluids and special core analysis, material balance, decline analysis, well tests, waterflood design and voidage surveillance, recovery screening and full reservoir simulation, with risked reserves and forecast scenarios for the development plan.',
    apps: [
      'Fluid Systems Studio',
      'SCAL Studio',
      'Material Balance Studio',
      'Decline Curve Analysis',
      'Well Test Analysis Studio',
      'Reservoir Simulation Studio',
      'Waterflood Design Studio',
      'Voidage Replacement Monitor',
      'EOR Screening',
      'Recovery Factor Estimator',
      'Well Spacing Optimizer',
      'Forecast Scenario Hub',
      'Risked Reserves Valuation',
    ],
  },
  {
    slug: 'drilling',
    name: 'Drilling & Completion',
    short: 'Drilling',
    tagline: 'Prove the well on screen before you spud.',
    description:
      'Well design, casing and tubing, fluids and hydraulics, torque and drag, well control, cementing and wellbore stability, then completions, perforating and sand control, stimulation, cost and time, and well integrity through plug and abandonment.',
    apps: [
      'Well Design Studio',
      'Casing & Tubing Design Studio',
      'Drilling Fluids & Hydraulics Studio',
      'Torque & Drag Studio',
      'Well Control Studio',
      'Cementing Studio',
      'Geomechanics & Wellbore Stability Studio',
      'Completion Design Studio',
      'Perforation & Sand Control Designer',
      'Stimulation Designer',
      'Well Cost & Time Estimator',
      'Well Integrity & P&A Studio',
    ],
  },
  {
    slug: 'production',
    name: 'Production Operations',
    short: 'Production',
    tagline: 'More barrels from the wells you already have.',
    description:
      'Nodal analysis from reservoir to separator, gas well deliverability, artificial lift design for gas lift, ESP and rod pump, chokes and wellheads, flow assurance, gathering networks, allocation, surveillance and intervention planning.',
    apps: [
      'Nodal Analysis Studio',
      'Gas Well Performance Studio',
      'Artificial Lift Advisor',
      'Gas Lift Design Studio',
      'ESP Design Studio',
      'Rod Pump Design Studio',
      'Choke & Wellhead Performance Studio',
      'Flow Assurance Studio',
      'Production Network Studio',
      'Production Allocation Studio',
      'Production Surveillance Studio',
      'Well Intervention Planner',
    ],
  },
  {
    slug: 'facilities',
    name: 'Facilities Engineering',
    short: 'Facilities',
    tagline: 'Size and check the surface plant.',
    description:
      'Lines, separators and slug catchers, relief and flare, compressors, pumps, heat exchangers, meters, control valves and storage tanks, plus gas processing, produced water treatment, corrosion and integrity, and facility layout.',
    apps: [
      'Pipeline & Line Sizing Studio',
      'Separator & Slug Catcher Studio',
      'Relief & Flare Studio',
      'Compressor Station Designer',
      'Pump Station Designer',
      'Heat Exchanger & Cooling Studio',
      'Gas Processing Studio',
      'Produced Water Treatment Studio',
      'Flow Metering Designer',
      'Control Valve & Choke Sizing',
      'Storage Tank & Venting Designer',
      'Corrosion & Integrity Studio',
      'Facility Layout Mapper',
    ],
  },
  {
    slug: 'process-safety',
    name: 'Process Safety',
    short: 'Process Safety',
    tagline: 'Know the risk and show it is ALARP.',
    description:
      'Layers of protection analysis and the SIL each safety function must reach, consequence modelling for releases, fires and explosions, and quantitative risk assessment judged against ALARP criteria.',
    apps: ['LOPA & SIL Studio', 'Consequence Modelling Studio', 'QRA Studio'],
  },
  {
    slug: 'midstream-downstream',
    name: 'Midstream & Downstream',
    short: 'Midstream',
    tagline: 'From crude assay to the fuel pump.',
    description:
      'Crude assays and blending, refinery planning and scheduling, modular refinery feasibility, terminals and depots, fuel pricing and supply, materials and spares planning, offshore marine logistics, LPG and CNG rollout, flare gas to value, energy efficiency, and a carbon ledger that runs beside the money one.',
    apps: [
      'Crude Assay & Blending Studio',
      'Product Blending Optimizer',
      'Refinery Planning & Scheduling Studio',
      'Modular Refinery Feasibility Studio',
      'Terminal & Depot Studio',
      'Fuel Pricing & Supply Chain Studio',
      'Materials & Spares Planner',
      'Marine Logistics Planner',
      'LPG & CNG Rollout Studio',
      'Flare Gas to Value Studio',
      'Energy & Utilities Efficiency Studio',
      'Carbon Footprint & Abatement Studio',
    ],
  },
  {
    slug: 'economics',
    name: 'Economics & Project Management',
    short: 'Economics',
    tagline: 'Decisions the board can defend.',
    description:
      'Cash flow and NPV under real fiscal regimes, probabilistic breakeven, decision trees and value of information, capital portfolios, AFE cost control, project management, field development planning and technical reporting.',
    apps: [
      'Petroleum Economics Studio',
      'Fiscal Regime Designer',
      'NPV Scenario Builder',
      'Probabilistic Breakeven Analyzer',
      'Decision Studio',
      'Decision Tree Builder',
      'Value of Information Analyzer',
      'Capital Portfolio Studio',
      'AFE Cost Control Manager',
      'Project Management Pro',
      'FDP Accelerator',
      'Technical Report Autopilot',
    ],
  },
  {
    slug: 'assurance',
    name: 'Assurance',
    short: 'Assurance',
    tagline: 'Keep the work compliant and the record straight.',
    description:
      'Risk registers and heatmaps, management of change, audits and findings, document control, peer review, quality assurance plans, ISO and regulatory compliance, and a lessons learned library the next project can search.',
    apps: [
      'Risk Register',
      'Risk Heatmap',
      'Management of Change',
      'Audit & Findings Manager',
      'Document Control',
      'Peer Review Manager',
      'Quality Assurance Plan',
      'ISO Compliance Tool',
      'Regulatory Compliance',
      'Lesson Learned DB',
    ],
  },
  {
    slug: 'data-ai',
    name: 'Data & AI',
    short: 'Data & AI',
    tagline: 'Machine learning you can audit.',
    description:
      'Statistics and machine learning on your own well and production data: quality checks that state the rule behind every flag, models scored on wells held out of training, electrofacies compared with core, backtested production forecasts, and evaluation of search and question-answering systems.',
    apps: [
      'Data Quality Studio',
      'ML Workbench',
      'Electrofacies Studio',
      'Production Forecasting ML Workbench',
      'AI Evaluation Studio',
    ],
  },
];

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

export const suiteStats = (modules = SUITE_MODULES) => {
  const apps = modules.reduce((n, m) => n + m.apps.length, 0);
  return {
    apps,
    modules: modules.length,
    modulesWord: NUMBER_WORDS[modules.length] ?? String(modules.length),
  };
};

// NextGen Academy courses (academy_apps on the NextGen project, checked
// 2026-10-05 into the same snapshot). NEXTGEN_LIVE_COURSES counts status
// 'available', which is what nextgen.petrolord.com shows as its course count;
// NEXTGEN_APP_COURSES counts those of course_type 'app', the ones built on a
// Suite app (the rest are engine and practice courses). The academy homepage
// reads these live; here they are static, so update both with the snapshot
// when a course goes live.
export const NEXTGEN_LIVE_COURSES = 79;
export const NEXTGEN_APP_COURSES = 72;
