export default {
  appKey: "lessons",
  title: "Lessons Learned",
  summary: "Capture what happened, why it happened and what to do about it, have somebody other than the author validate it, publish it, and record where it was applied, including risks and change requests raised straight from the lesson. Reuse is counted from those records.",
  sections: [
    {
      id: "purpose",
      title: "What this app is for",
      paragraphs: [
        "Lessons Learned is the register of lessons from incidents, near misses, audit findings, non-conformances, changes, project close-outs, operational experience and successes. A lesson moves from a quick draft to a validated, published record, and then into the procedures, risks and changes it alters.",
        "It is for anyone capturing a lesson, the reviewers who validate them, the assurance and HSE leads who publish them and chase the unapplied ones, and engineers searching before they start a job. Its headline measure is how many published lessons have been applied nowhere."
      ]
    },
    {
      id: "getting-started",
      title: "Getting started",
      steps: [
        "Click Capture a lesson (top right of every page) or Capture in the menu.",
        "Enter the Title and What happened, both required. Add What it cost, the Event date, Where it came from and Its reference if known.",
        "Add the Root cause category, Why it happened and What to do about it if you know them. A draft can be saved without them; the page lists what is still missing for validation.",
        "Choose the Scope (This asset, This discipline, This organization or Industry-wide) and fill in Category, Discipline, Department, Project, Asset, Author, Review due and Keywords as needed. Leave Author blank to record yourself, pick a Suite member, or type the name of somebody without an account. Industry-wide scope requires What to do about it.",
        "Click Capture lesson. It is saved as a Draft numbered LL-2026-001 and its page opens.",
        "Complete the analysis with Edit the lesson, then click Submitted under Move this lesson. Editing a Validated lesson sends it back to Submitted for validating again.",
        "A colleague who is neither the author nor the person who captured it clicks Validated, leaves Validator blank to record themselves (or types an external reviewer's name), and clicks Validate.",
        "Click Published.",
        "Under Where this lesson went, use Raise a risk, Raise a change or Record an application each time the lesson is used. Once one application is Adopted or Adapted, click Embedded."
      ]
    },
    {
      id: "rules",
      title: "Rules the app enforces",
      bullets: [
        "A draft needs a title and what happened. Industry-wide scope also needs what to do about it.",
        "Validated, Published and Embedded all need what happened, why it happened and what to do about it. The page names what is missing.",
        "The author may not validate their own lesson. The app and the database refuse a validation by the author's Suite account, or by the account that captured the lesson when the author was typed by name. A validator typed by name is recorded as typed and is not checked.",
        "Published needs a validation date and validator, and records today as the published date.",
        "Embedded needs at least one application with outcome Adopted or Adapted. Rejected applications do not count; the database counts them itself.",
        "Archiving needs a written reason. Superseded asks which lesson replaces this one, from the lessons that are not archived or superseded, and a lesson cannot supersede itself.",
        "A Validated lesson that is edited goes back to Submitted and its validation is cleared. A Published or Embedded lesson cannot be edited: capture the corrected lesson and mark the old one Superseded by it.",
        "Only a Draft or Submitted lesson that was never validated and has no applications can be deleted, and only after you confirm. Anything else is archived with a reason.",
        "An application needs a target and an outcome. Risk register needs a risk picked from your register, Management of change a change record picked from yours, and every other target a reference naming what changed. A Rejected outcome needs notes saying why.",
        "Raise a risk needs a title, a category, and likelihood and impact from 1 to 5. It creates the risk on your risk register with its next number, carries the lesson's root cause and recommendation onto it as root cause and mitigation, and records an Adopted application.",
        "Raise a change needs a title, category, type, priority and justification. It creates a Draft change request with the lesson's description as its current situation, and records an Adopted application.",
        "If the risk or change is created but the link back fails, the message names the new record so you can link it with Record an application.",
        "A review is overdue when a Published or Embedded lesson is past its review due date, and due soon within 30 days."
      ]
    },
    {
      id: "workflow",
      title: "Lifecycle and statuses",
      bullets: [
        "Draft: captured, maybe incomplete. Moves to Submitted or Archived.",
        "Submitted: ready for review. Moves to Validated, back to Draft, or Archived.",
        "Validated: accepted by somebody other than the author. Moves to Published, back to Submitted, or Archived.",
        "Published: visible in searches of published lessons. Moves to Embedded, Superseded or Archived.",
        "Embedded: has changed something. Moves to Superseded or Archived.",
        "Archived and Superseded are final.",
        "Applications can be added or removed at any status except Archived and Superseded. Every move, validation and application is written to History."
      ]
    },
    {
      id: "reports",
      title: "Dashboard, search, reports and exports",
      paragraphs: [
        "There is no reusability rating. Scope records how widely a lesson could apply; the register counts how often it has been applied, shown as Applied 2x, or Applied nowhere for a published lesson with no adopted or adapted application."
      ],
      bullets: [
        "Dashboard tiles: Lessons, Applied nowhere (Published or Embedded, no adopted or adapted application), Awaiting validation (Submitted), and Pushed into a register (adopted or adapted applications into the risk register or Management of change).",
        "Dashboard panels: lessons by status and by category, and Needing attention: up to eight lessons, published ones applied nowhere first, then Submitted, then published with an overdue review.",
        "Search: every word you type must appear somewhere in the lesson's text fields. Published lessons only is ticked by default and includes Embedded. Filter by category, discipline, source and scope.",
        "Reports: tiles for Applied nowhere, Applications recorded (every application, with how many changed something and how many were rejected), Into the risk register and Into change control; the list of published lessons applied to nothing; root cause categories; what lessons have changed, by target; and outcomes including rejections.",
        "CSV exports on Reports: Register (status, scope, dates, times applied, targets, rejections), Applications (lesson, target, reference, outcome, date, notes) and Applied nowhere. Export on the Register page gives the rows shown, with the full lesson text."
      ]
    },
    {
      id: "limits",
      title: "What the app does not do",
      bullets: [
        "Nothing is stored until the database update for this app (migration 20260917700000) is applied; until then each page shows a notice.",
        "Edit the lesson covers what happened, what it cost, the root cause and its category, and what to do about it, up to Validated. Title, scope, category, keywords, review date and other details cannot be changed after capture.",
        "Lessons captured before this change with Author left blank show the author as Not set; the account is still recorded for the independence check.",
        "Deleting a lesson removes it for good. Risks and changes raised from it remain in their own registers.",
        "Risk and change pickers list up to 500 recent records, and are empty if that register cannot be read. If those registers cannot issue a number, raise the record in its own app and link it.",
        "No attachments, reminders or printable reports. Review dates only affect the Needing attention order."
      ]
    },
    {
      id: "faq",
      title: "Questions",
      bullets: [
        "Why can I not validate my own lesson? The author may not. Ask a colleague, or record an external reviewer by name.",
        "Why is Validated refused when I am not the author? What happened, why it happened or what to do about it is missing.",
        "Why is Embedded refused? No application is Adopted or Adapted yet.",
        "How do I correct a published lesson? Capture the corrected lesson, then mark the old one Superseded and pick the new one.",
        "Does Raise a risk create a real risk? Yes, on your risk register with its next number, linked back to the lesson.",
        "Why does search find nothing? Every word must appear. Use fewer words, or untick Published lessons only.",
        "Can I save before I know the root cause? Yes. A draft needs only a title and what happened."
      ]
    }
  ],
  glossary: [
    { term: "Lesson", definition: "What happened, why it happened and what to do about it." },
    { term: "Validation", definition: "Acceptance by somebody other than the author, with a date and a name." },
    { term: "Published", definition: "A validated lesson visible to the organization." },
    { term: "Embedded", definition: "A lesson with at least one adopted or adapted application." },
    { term: "Archived", definition: "Withdrawn from use, with a written reason." },
    { term: "Superseded", definition: "Replaced by a named newer lesson." },
    { term: "Application", definition: "Where a lesson was applied: target, outcome, date and notes." },
    { term: "Outcome", definition: "Adopted, Adapted or Rejected. Only the first two change anything." },
    { term: "Target", definition: "What the lesson was applied to, such as a risk, a change record, a procedure or training." },
    { term: "Scope", definition: "How widely a lesson could apply, from this asset to industry-wide." },
    { term: "Applied nowhere", definition: "Published or embedded with no adopted or adapted application." },
    { term: "Root cause category", definition: "One of ten fixed groupings of why lessons happened." },
    { term: "Source", definition: "Where the lesson came from, such as an incident or project close-out." }
  ]
};
