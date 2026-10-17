// The NAPE 2026 email series (owner decision 2026-10-17, job a): four emails
// building up to the NAPE exhibition in Lagos, 9 to 11 November 2026.
// Rewritten 2026-10-17 after owner feedback: written for people who have
// never used Petrolord. Each email leads with the value of the whole
// platform; recent features appear only as supporting proof. One call to
// action per email.
//
// Every fact here comes from the repo; a fact the repo does not hold is a
// [PLACEHOLDER] for the reviewer, listed in the task's notes, and execute.mjs
// refuses to send while one is unfilled. Sources:
//   src/pages/Home.jsx            positioning line, PILLARS (engines tested against
//                                 published references, shared registries, nothing to
//                                 install), TRUST (export any time), NextGen and HSE
//                                 cards (HSE "Free to start"), "Book a demo ... on your
//                                 own data"
//   src/data/suiteCatalog.js      105 apps, ten modules, module taglines and
//                                 descriptions, 80 NextGen courses (73 on Suite apps)
//   src/lib/units/presets.js      oilfield preset (ft, psi, degF, bbl) is the default
//   docs/scope/WellDesignStudio-STATUS.md, docs/scope/Seismolord-PLAYBOOK.md
//                                 Minna / Nigeria belts and UTM 31N/32N with the EPSG
//                                 Minna to WGS 84 transformations
//   tools/validation/mbal-validation.ts            Pletcher, SPE 75354
//   docs/scope/WellTestAnalysisStudio-STATUS.md    Lee (1982) Example 2.1, k 48 md, skin 1.43
//   docs/scope/DeclineCurveAnalysis-STATUS.md      SPEE REP #6 Table 1
//   docs/scope/Seismolord-STATUS.md               ZGY bit for bit with OpenZGY; Local
//                                                 Workspace 20 GB in 291 s, no upload
//   docs/scope/QIStudio-STATUS.md, docs/scope/SuiteProjects-GUIDE.md (clients and projects)
//   docs/scope/GuidedJourney-STATUS.md, docs/ai-employees/REGISTER.md (YouTube)
//   docs/scope/NAPE-LEADS-STATUS.md, docs/scope/NAPE-QUIZ-STATUS.md (/nape, WhatsApp,
//                                 quiz days, prizes, booth screen)

export const SERIES = 'nape2026';
export const WHATSAPP = '+234 901 556 6981';
export const WHATSAPP_URL = 'https://wa.me/2349015566981';
export const NAPE_URL = 'https://petrolord.com/nape';
export const QUIZ_URL = 'https://petrolord.com/nape/quiz';
export const YOUTUBE_URL = 'https://www.youtube.com/@PetrolordSuite';
export const NEXTGEN_URL = 'https://nextgen.petrolord.com';
export const SUITE_URL = 'https://petrolord.com';
const DEMO_TEXT = 'Hello Petrolord, I would like a demo slot at your NAPE 2026 booth. My discipline is: ';
export const DEMO_URL = `${WHATSAPP_URL}?text=${encodeURIComponent(DEMO_TEXT)}`;

export const REASON = 'You are receiving this email because you asked Petrolord to keep in touch, at a NAPE exhibition or on petrolord.com/nape.';

/** 09:00 in Lagos (UTC+1 all year, no daylight saving) as an ISO instant. */
export const lagosNine = (date) => new Date(`${date}T08:00:00.000Z`).toISOString();

const FILL_NOTE = 'Fill in every fact in square brackets (the Facts box) before approving. execute.mjs will not create the campaign while any is unfilled.';
const COUNTS_NOTE = ({ apps, modules, courses, appCourses }) => `Counts from src/data/suiteCatalog.js on the day of drafting: ${apps} apps in ${modules} modules, ${courses} NextGen courses (${appCourses} on Suite apps). Check they still match before approving.`;
const GUIDED_NOTE = 'Check before approving: the guided start (Guided Journey G2c to G4, merged #1197) is live on petrolord.com by the send date. If it is not, delete that line.';

/**
 * The four drafts. stats: { apps, modulesWord, courses, appCourses } from
 * src/data/suiteCatalog.js, passed in so the copy follows the catalogue.
 */
export function napeSeries({ apps, modulesWord, courses, appCourses }) {
  const modules = String(modulesWord).toLowerCase();
  const counts = COUNTS_NOTE({ apps, modules, courses, appCourses });
  const napeFacts = [
    ['When', 'Monday 9 to Wednesday 11 November 2026'],
    ['Where', '[VENUE], Lagos'],
    ['Booth', '[BOOTH NUMBER]'],
    ['Quiz', 'The Petrolord Upstream Challenge, 2pm each day at the booth'],
  ];
  return [
    {
      n: 1,
      date: '2026-10-21',
      subject: 'Meet Petrolord at NAPE 2026: one platform from seismic to economics',
      preheader: `${apps} engineering apps in your browser for the whole asset team. See them at our booth in Lagos, 9 to 11 November.`,
      audience: ['nape-optins', 'nape-2026-leads'],
      blocks: [
        { h: 'One platform for the whole asset team' },
        { p: `Petrolord Suite is engineering software for the whole energy asset, from subsurface to sales. It brings ${apps} apps across ${modules} modules into one platform that runs in your browser, so geoscientists, engineers and economists work on the same project and pass their results straight to each other.` },
        { h2: 'Why teams choose Petrolord' },
        { list: [
          'One project, many studios. Wells, tops, surfaces and interpretations are published to shared registries, so work done in one app is ready in the next.',
          'Nothing to install. The Suite runs in a modern browser, with no licence servers or dongles, and new releases reach every seat at once.',
          'Answers you can check. The calculations are tested against published references and known answers before an app is released.',
          'Set up for how we work here. Oilfield units (ft, psi, bbl) are the default, and the Nigerian Minna coordinate systems come with their EPSG datum transformations.',
          `Training on the same screens. NextGen Academy teaches ${courses} courses, ${appCourses} of them on Suite apps, with certificates anyone can verify.`,
        ] },
        { h2: 'See it at NAPE 2026' },
        { facts: napeFacts },
        { p: 'Come to the booth for a demo, bring a question from your own field, and play the Petrolord Upstream Challenge for prizes at 2pm each day.' },
        { button: { label: 'Let us know you are coming', href: NAPE_URL } },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        counts,
        'Why Petrolord points are the homepage pillars (src/pages/Home.jsx PILLARS) and the units and CRS facts (src/lib/units/presets.js, docs/scope/WellDesignStudio-STATUS.md).',
      ],
    },
    {
      n: 2,
      date: '2026-10-28',
      subject: 'Everything your asset team needs, in one platform',
      preheader: 'A tour of Petrolord Suite by discipline, from seismic interpretation to field development economics, and the evidence behind the answers.',
      // Suite product content (with NextGen as the training): only leads who chose
      // the Suite or NextGen, plus the opt-in list. The consent on /nape covers
      // "the products I chose".
      audience: ['nape-optins', 'nape-2026-leads:suite', 'nape-2026-leads:nextgen'],
      blocks: [
        { h: 'Everything your asset team needs, in one platform' },
        { p: `If your team moves data between separate tools and spreadsheets, Petrolord Suite gives you one place for the work: ${apps} apps across ${modules} modules, in the browser, sharing the same wells, tops and surfaces. Here is what it covers.` },
        { facts: [
          ['Geoscience', 'From seismic to volumes in place: 2D and 3D seismic interpretation in Seismolord, log analysis in Petrophysics Studio, correlation, mapping, and quantitative interpretation in QI Studio from data audit to prospect.'],
          ['Reservoir', 'Understand the reservoir and plan its recovery: fluids, material balance, decline analysis, well tests, waterflood design and full reservoir simulation.'],
          ['Drilling and completion', 'Prove the well on screen before you spud: well design, casing, hydraulics, torque and drag, well control, cementing, completions, and cost and time.'],
          ['Production', 'More barrels from the wells you already have: nodal analysis, gas lift, ESP and rod pump design, flow assurance, allocation and surveillance.'],
          ['Facilities and process safety', 'Size and check the surface plant, then show the risk is ALARP: separators, relief and flare, compressors, gas processing, LOPA and QRA.'],
          ['Midstream and downstream', 'From crude assay to the fuel pump: blending, refinery planning, modular refinery feasibility, terminals and depots, LPG and CNG rollout.'],
          ['Economics', 'Decisions the board can defend: cash flow and NPV under real fiscal regimes, probabilistic breakeven, decision trees, portfolios and field development planning.'],
          ['Assurance and data', 'Risk registers, management of change and audits, plus machine learning you can audit on your own well and production data.'],
        ] },
        { h2: 'Answers you can defend' },
        { list: [
          'Material Balance Studio is checked against a published SPE gas reservoir case (Pletcher, SPE 75354).',
          'Well Test Analysis Studio recovers the textbook answer to Lee (1982) Example 2.1: permeability 48 md and skin 1.43.',
          'Decline Curve Analysis is checked against SPEE Recommended Evaluation Practice 6.',
          'Seismolord opens Petrel ZGY files directly and reads them bit for bit the same as the OpenZGY reference reader, so volumes from Petrel come across unchanged.',
        ] },
        { h2: 'Built for real projects and real teams' },
        { list: [
          'Big seismic without big uploads: Local Workspace keeps volumes on your own computer. In our tests a 20 GB SEG-Y was ready in under five minutes with nothing uploaded.',
          'Clients and projects keep each company\'s data apart, for consultants and teams working on several fields.',
          'Your data stays yours: an organisation can export a complete copy of everything, any day.',
          `A guided start suggests where to begin for your discipline, and NextGen Academy trains the team on the same apps (${courses} courses). Demos and lessons are on YouTube at @PetrolordSuite.`,
        ] },
        { p: 'See it live at NAPE 2026, booth [BOOTH NUMBER], [VENUE], Lagos, 9 to 11 November. Book a demo slot, tell us your discipline, and we will show you the apps for your work.' },
        { button: { label: 'Book a demo slot on WhatsApp', href: DEMO_URL } },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        counts,
        'Audience: Suite product content, so the NAPE 2026 leads are only those who chose Petrolord Suite or NextGen Academy on the /nape form (their consent covers the products they chose). Leads who chose only HSE, Consulting or Something else do not get this one; they get emails 1, 3 and 4, which are about the event.',
        'Discipline lines are the module taglines and descriptions in src/data/suiteCatalog.js. Proof points: tools/validation/mbal-validation.ts (SPE 75354), docs/scope/WellTestAnalysisStudio-STATUS.md (Lee 1982 Example 2.1: k 48.04 md, skin 1.4301), docs/scope/DeclineCurveAnalysis-STATUS.md (SPEE REP #6 Table 1), docs/scope/Seismolord-STATUS.md (ZGY, Local Workspace: 20,168,123,600 bytes in 291 s, 0 seismic bytes uploaded).',
        'ZGY: no real client ZGY has been tested yet (docs/scope/Seismolord-STATUS.md). The copy claims only the reference-reader match.',
        GUIDED_NOTE,
        'The button opens WhatsApp (+234 901 556 6981) with a demo request typed in for the reader to complete.',
      ],
    },
    {
      n: 3,
      date: '2026-11-04',
      subject: 'Win prizes and try Petrolord at NAPE: the Upstream Challenge, 2pm daily',
      preheader: 'A live quiz on your phone at our booth with three winners a day, and the Suite on the booth screen for you to try.',
      audience: ['nape-optins', 'nape-2026-leads'],
      blocks: [
        { h: 'The Petrolord Upstream Challenge' },
        { p: 'At NAPE 2026 we are running a live quiz at our booth every day at 2pm. Scan the QR code at booth [BOOTH NUMBER], choose a nickname and answer on your phone. Every correct answer scores, and faster answers score more.' },
        { facts: [
          ['Monday 9 Nov', 'Day 1: Exploration'],
          ['Tuesday 10 Nov', 'Day 2: Production'],
          ['Wednesday 11 Nov', 'Day 3: Reservoir Modelling and Field Development'],
          ['Time', '2pm each day, booth [BOOTH NUMBER], [VENUE]'],
        ] },
        { h2: 'Prizes, each day' },
        { list: [
          "1st place: two months of one Petrolord app of your choice from the day's theme (one seat, to be started within 90 days), and a certificate of achievement.",
          '2nd place: a sponsored NextGen Academy Petrophysics course at Associate level, with Professional also sponsored if you pass Associate within 60 days, and a certificate.',
          '3rd place: a certificate and a 50% discount code for a NextGen Associate course.',
        ] },
        { p: 'A tie for a podium place is settled by tie-breaker questions for the tied players only. Prizes are handed over at the booth.' },
        { h2: 'Try the Suite while you are there' },
        { list: [
          'Watch the Petrophysics Studio and QI Studio demos on the booth screen.',
          'Ask the team to walk you through the apps for your discipline, from seismic to economics.',
          'Bring a question from your own field and we will show you how the Suite handles it.',
          'Ask about NextGen Academy courses and certificates, and Petrolord HSE for incident reporting, permit to work and audits, which is free to start.',
        ] },
        { button: { label: 'See the quiz page', href: QUIZ_URL } },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        'Days, time, scoring and prizes are the owner decisions in docs/scope/NAPE-QUIZ-STATUS.md. Prizes are handed over by staff; nothing is granted by the app.',
        'Booth screen demos: docs/scope/NAPE-QUIZ-STATUS.md (Booth TV). HSE "Free to start" and its features: the homepage HSE card (src/pages/Home.jsx).',
        'The quiz page shows the schedule before a game opens; joining needs the game lobby at the booth.',
      ],
    },
    {
      n: 4,
      date: '2026-11-08',
      subject: 'NAPE starts tomorrow: three reasons to visit Petrolord at booth [BOOTH NUMBER]',
      preheader: 'One platform from seismic to economics, answers you can check, and the Upstream Challenge at 2pm each day.',
      audience: ['nape-optins', 'nape-2026-leads'],
      blocks: [
        { h: 'See you at NAPE this week' },
        { p: 'NAPE 2026 opens tomorrow in Lagos. Here are three reasons to stop by our booth.' },
        { list: [
          `See your whole asset in one platform: ${apps} apps from seismic interpretation to field development economics, running in the browser with nothing to install.`,
          'Check the answers yourself: our engines are tested against published references, and the team will show you the evidence for the apps you use.',
          'Play the Petrolord Upstream Challenge at 2pm and win two months of a Petrolord app or a sponsored NextGen course.',
        ] },
        { facts: [
          ['Where', 'Booth [BOOTH NUMBER], [VENUE], Lagos'],
          ['When', 'Monday 9 to Wednesday 11 November 2026, [EXHIBITION OPENING HOURS]'],
          ['Quiz', '2pm each day: Exploration on Monday, Production on Tuesday, Reservoir Modelling and Field Development on Wednesday'],
          ['WhatsApp', WHATSAPP],
        ] },
        { p: 'Want a set time with the team? Book a demo slot on WhatsApp and tell us your discipline.' },
        { button: { label: 'Book a demo slot on WhatsApp', href: DEMO_URL } },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        'Sent on Sunday 8 November, the day before the exhibition opens.',
        'The three reasons restate emails 1 to 3: the platform (src/data/suiteCatalog.js, homepage), the validation pillar (src/pages/Home.jsx PILLARS), the quiz prizes (docs/scope/NAPE-QUIZ-STATUS.md).',
      ],
    },
  ];
}
