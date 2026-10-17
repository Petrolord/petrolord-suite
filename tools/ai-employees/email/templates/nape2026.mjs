// The NAPE 2026 email series (owner decision 2026-10-17, job a): four emails
// building up to the NAPE exhibition in Lagos, 9 to 11 November 2026.
// Every fact here comes from the repo; a fact the repo does not hold is a
// [PLACEHOLDER] for the reviewer, listed in the task's notes, and execute.mjs
// refuses to send while one is unfilled. Sources:
//   docs/scope/NAPE-LEADS-STATUS.md, src/lib/eventLeads.js   (/nape, WhatsApp)
//   docs/scope/NAPE-QUIZ-STATUS.md, src/lib/eventQuiz.js     (quiz, days, prizes)
//   src/data/suiteCatalog.js                                 (app and course counts)
//   docs/scope/Seismolord-STATUS.md                          (ZGY import, Local Workspace)
//   docs/scope/LocalWorkspace-DESIGN.md, docs/scope/QIStudio-STATUS.md
//   docs/scope/GuidedJourney-STATUS.md, docs/ai-employees/REGISTER.md (YouTube)

export const SERIES = 'nape2026';
export const WHATSAPP = '+234 901 556 6981';
export const WHATSAPP_URL = 'https://wa.me/2349015566981';
export const NAPE_URL = 'https://petrolord.com/nape';
export const QUIZ_URL = 'https://petrolord.com/nape/quiz';
export const YOUTUBE_URL = 'https://www.youtube.com/@PetrolordSuite';
export const NEXTGEN_URL = 'https://nextgen.petrolord.com';
export const SUITE_URL = 'https://petrolord.com';

export const REASON = 'You are receiving this email because you asked Petrolord to keep in touch, at a NAPE exhibition or on petrolord.com/nape.';

/** 09:00 in Lagos (UTC+1 all year, no daylight saving) as an ISO instant. */
export const lagosNine = (date) => new Date(`${date}T08:00:00.000Z`).toISOString();

const FILL_NOTE = 'Fill in every fact in square brackets (the Facts box) before approving. execute.mjs will not create the campaign while any is unfilled.';

/**
 * The four drafts. stats: { apps, modulesWord, courses, appCourses } from
 * src/data/suiteCatalog.js, passed in so the copy follows the catalogue.
 */
export function napeSeries({ apps, modulesWord, courses, appCourses }) {
  const modules = String(modulesWord).toLowerCase();
  return [
    {
      n: 1,
      date: '2026-10-21',
      subject: 'Save the date: Petrolord at NAPE 2026 in Lagos, 9 to 11 November',
      preheader: 'Meet the team, see the Suite at work and play the Petrolord Upstream Challenge at 2pm each day.',
      audience: ['nape-optins', 'nape-2026-leads'],
      blocks: [
        { h: 'Meet Petrolord at NAPE 2026' },
        { p: 'Petrolord will be at the NAPE exhibition in Lagos from Monday 9 to Wednesday 11 November 2026. We would be glad to see you at our booth.' },
        { facts: [
          ['When', 'Monday 9 to Wednesday 11 November 2026'],
          ['Where', '[VENUE], Lagos'],
          ['Booth', '[BOOTH NUMBER]'],
          ['Quiz', 'The Petrolord Upstream Challenge, 2pm each day at the booth'],
        ] },
        { h2: 'Why visit' },
        { list: [
          'Watch the Petrophysics Studio and QI Studio demos on the booth screen, then ask the team to walk you through the apps you use.',
          'Bring a question from your own work and see how the Suite handles it.',
          'Play the Petrolord Upstream Challenge, a live quiz on your phone with three winners each day.',
          `Ask about NextGen Academy: ${courses} courses, ${appCourses} of them built on Petrolord Suite apps.`,
        ] },
        { p: `Petrolord Suite brings ${apps} apps across ${modules} modules into one platform, from geoscience and reservoir engineering to drilling, production, facilities and economics.` },
        { button: { label: 'Let us know you are coming', href: NAPE_URL } },
        { p: `Prefer WhatsApp? Message us on [${WHATSAPP}](${WHATSAPP_URL}).` },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        `Counts from src/data/suiteCatalog.js on the day of drafting: ${apps} apps in ${modules} modules, ${courses} NextGen courses (${appCourses} app courses). Check they still match before approving.`,
        'The booth screen loops the Petrophysics and QI demos (docs/scope/NAPE-QUIZ-STATUS.md, Booth TV).',
      ],
    },
    {
      n: 2,
      date: '2026-10-28',
      subject: "What's new in Petrolord this year, ahead of NAPE 2026",
      preheader: `Petrel ZGY import, seismic that stays on your computer, QI Studio, a guided start and ${courses} NextGen courses.`,
      // product news: only leads who chose the Suite or NextGen, plus the opt-in list
      audience: ['nape-optins', 'nape-2026-leads:suite', 'nape-2026-leads:nextgen'],
      blocks: [
        { h: "What's new in Petrolord" },
        { p: 'Here is what we have built this year. You can see all of it at our NAPE booth in Lagos, 9 to 11 November.' },
        { h2: 'Petrel ZGY import in Seismolord' },
        { p: 'Seismolord now imports Petrel ZGY files wherever it takes SEG-Y: versions 1 to 4, including ZFP-compressed volumes. Our reader matches the OpenZGY reference reader bit for bit, and a ZGY and a SEG-Y of the same samples load identically.' },
        { h2: 'Local Workspace: keep your seismic on your own computer' },
        { p: 'Large surveys no longer have to be uploaded. Seismolord and QI Studio can keep a volume on your computer, store only the interpretation in the cloud and compute attributes locally. In our tests a 20 GB SEG-Y was imported in under five minutes with no seismic uploaded.' },
        { h2: 'QI Studio' },
        { p: 'Quantitative interpretation in one app: data audit and feasibility, seismic QC, well ties, post-stack impedance inversion, porosity and facies from the inversion, and prospect evaluation, with a handover pack at the end.' },
        { h2: 'A guided start' },
        { p: 'When you sign in, the Suite greets you, asks your discipline and suggests where to start. Every app has a Guide button, and an Activity panel keeps track of long-running jobs.' },
        { h2: 'NextGen Academy' },
        { p: `${courses} courses, ${appCourses} of them built on Petrolord Suite apps, from petrophysics and QI to drilling, production and economics. The NextGen QI course went live in October. [Browse the courses](${NEXTGEN_URL}).` },
        { h2: 'Video library' },
        { p: 'Demos and first-module lessons for our apps are on YouTube at @PetrolordSuite, with more added each week.' },
        { button: { label: 'Watch on YouTube', href: YOUTUBE_URL } },
        { p: `See it all at NAPE: booth [BOOTH NUMBER], [VENUE], Lagos. [Let us know you are coming](${NAPE_URL}).` },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        'Product news, so the NAPE 2026 leads are only those who chose Petrolord Suite or NextGen Academy on the /nape form (their consent covers the products they chose). Leads who chose only HSE, Consulting or Something else do not get this one.',
        'Check before approving: the guided start (Guided Journey G2c to G4, merged #1197) is live on petrolord.com by 28 October. If it is not, delete that section.',
        'ZGY: no real client ZGY has been tested yet (docs/scope/Seismolord-STATUS.md). The copy claims only the reference-reader match.',
        'Local Workspace figure: a 20,168,123,600-byte SEG-Y imported in 291 s with 0 seismic bytes uploaded (docs/scope/Seismolord-STATUS.md, 2026-10-15).',
      ],
    },
    {
      n: 3,
      date: '2026-11-04',
      subject: 'Play the Petrolord Upstream Challenge at NAPE, 2pm each day',
      preheader: 'A live quiz on your phone at our booth, with three winners a day and Petrolord and NextGen prizes.',
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
        { p: 'The questions cover geoscience, drilling, reservoir, production, facilities and economics. Most were written by the Petrolord team, and some are adapted from NextGen Academy courses.' },
        { button: { label: 'See the quiz page', href: QUIZ_URL } },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        'Days, time, scoring and prizes are the owner decisions in docs/scope/NAPE-QUIZ-STATUS.md. Prizes are handed over by staff; nothing is granted by the app.',
        'The quiz page shows the schedule before a game opens; joining needs the game lobby at the booth.',
      ],
    },
    {
      n: 4,
      date: '2026-11-08',
      subject: 'NAPE starts tomorrow: find Petrolord at booth [BOOTH NUMBER]',
      preheader: 'Monday 9 to Wednesday 11 November in Lagos. The Petrolord Upstream Challenge is at 2pm each day.',
      audience: ['nape-optins', 'nape-2026-leads'],
      blocks: [
        { h: 'See you at NAPE this week' },
        { p: 'NAPE 2026 opens tomorrow in Lagos. Here is what you need to find us.' },
        { facts: [
          ['Where', 'Booth [BOOTH NUMBER], [VENUE], Lagos'],
          ['When', 'Monday 9 to Wednesday 11 November 2026, [EXHIBITION OPENING HOURS]'],
          ['Quiz', '2pm each day: Exploration on Monday, Production on Tuesday, Reservoir Modelling and Field Development on Wednesday'],
          ['WhatsApp', `[${WHATSAPP}](${WHATSAPP_URL})`],
        ] },
        { p: 'Would you like a set time with the team? Send us a WhatsApp message and tell us what you would like to see.' },
        { button: { label: 'Message us on WhatsApp', href: WHATSAPP_URL } },
        { p: `At the booth, scan the QR code or open [petrolord.com/nape](${NAPE_URL}) to leave your details. It opens WhatsApp with a greeting that names you and the products you chose.` },
        { sign: true },
      ],
      notes: [
        FILL_NOTE,
        'Sent on Sunday 8 November, the day before the exhibition opens.',
        'The /nape form and the WhatsApp hand-over are described in docs/scope/NAPE-LEADS-STATUS.md.',
      ],
    },
  ];
}
