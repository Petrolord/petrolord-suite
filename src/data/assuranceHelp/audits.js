export default {
  appKey: "audits",
  title: "Audit & Findings Manager",
  summary: "Plan a year's audit programme, build reusable checklists, run each audit question by question, raise findings on the answers that fail, and carry every finding to closure. Programme delivery is counted from audits reported.",
  sections: [
    {
      id: "purpose",
      title: "What this app is for",
      paragraphs: [
        "Audit & Findings Manager runs checklist audits: safety, environmental, contractor, supplier, process, operational, permit to work and management system audits. Each audit has a lead auditor and an auditee, is worked against a protocol of questions, and can belong to an annual programme.",
        "It is for the HSE and assurance leads who own the programme, the auditors who answer the checklist, and the owners who close the findings. Clause-by-clause audits of an ISO management system belong in ISO Compliance; findings close by the same rules in both apps."
      ]
    },
    {
      id: "getting-started",
      title: "Getting started",
      steps: [
        "Open Programmes and click New programme. Enter the Title, Year, Owner, Objective and Scope and click Create programme. To approve it, click Approved, set Approved on, leave Approved by blank to record yourself or type the approver's name, and click Approve programme.",
        "Open Checklists and click New checklist. Enter the Reference, Title, Version, Audit type and Status, and click Create checklist. Set it Active when ready.",
        "Click Add a question. Enter the Section, Item number, Question, Criticality (Critical, Major or Minor), Guidance for the auditor and Reference, and click Add question; Done closes the form.",
        "Open Audits and click Plan an audit, or Plan an audit into it on a programme. Fill in the Title, Type, Checklist (or No checklist for an ad-hoc audit), Programme, site details, Lead auditor and Auditee (each a Suite member, or a typed name for somebody without an account), dates, Scope, Criteria and Audit team, and click Plan audit. It is numbered AUD-2026-001, its checklist is written out unanswered, and its page opens.",
        "Click In progress. For each item click Answer, choose the Result, set Examined on, note the Evidence seen and a Note, and click Record answer.",
        "On a Nonconformant row click Raise a finding. The type, title, evidence and requirement are filled in from the item; the type is Major nonconformity for Critical and Major items and Minor nonconformity for Minor ones. Set the Owner and Due date, answer Did work stop?, and click Raise finding.",
        "If questions were added to the checklist after planning, click Sync protocol on the audit page.",
        "Work each finding to closure from the Findings page.",
        "Click Fieldwork complete, then Reported. Write the Audit conclusion, check the Report issued date and click Issue the report; the button is enabled once the conclusion is written and the checklist is complete. Then click Closed when its findings allow."
      ]
    },
    {
      id: "rules",
      title: "Rules the app enforces",
      paragraphs: [
        "Each rule is checked on the page and again by the database. A refusal names the unmet condition and, where it can, the checklist items."
      ],
      bullets: [
        "An audit with a checklist cannot be Reported while any item is unanswered, including items never synced. The first eight are named. Ad-hoc audits are exempt.",
        "Every answer needs its examination date (blank records today). Not applicable needs a reason in the note. Nonconformant needs the evidence seen.",
        "A Critical item answered Nonconformant must have a finding raised on that answer before the audit can be Reported. A voided finding does not count.",
        "Reported also needs a conclusion and a lead auditor; the database also needs the report date.",
        "Closed needs the audit Reported, with no open Major nonconformity and no open stop-work finding from it.",
        "Audit moves: Planned to In progress or Cancelled; In progress to Fieldwork complete or Cancelled; Fieldwork complete to Reported, In progress or Cancelled; Reported to Closed.",
        "Cancelling needs a written reason. Audits cannot be deleted, so a programme keeps a record of what was planned and not done.",
        "An auditor may not audit their own area. Plan audit is refused when the lead auditor and the auditee are the same Suite member, or the same name typed on both. The database also refuses the same Suite account.",
        "A finding needs a type, a title and objective evidence. A stop-work finding must be a Major or Minor nonconformity and must record what was done at the time.",
        "A finding will not close while any action is Open or In progress. A Major or Minor nonconformity needs its correction. A Major one also needs its root cause, a Corrective action that is not Cancelled, and one verified effective. Observations and Opportunities for improvement need none of these.",
        "Effectiveness checks apply to Complete actions only and record today and you; not effective needs notes. An action needs a description, type and due date. Voiding needs a reason.",
        "Approving a programme needs a date and an approver; a blank Approved by records you. Complete needs every audit in it Reported, Closed or Cancelled with its reason; the others are named.",
        "A checklist used by any audit cannot be deleted; retire it. Retired checklists are not offered for new audits.",
        "A question that is in any audit's checklist cannot be deleted, because its answers would go with it, and its criticality cannot change once a reported audit was held to it. To change either, retire the checklist and build a new version.",
        "Once an audit is Reported its answers cannot be changed and no new findings can be raised on it. Its existing findings are still worked to closure.",
        "A finding can be deleted only while it is Open with nothing recorded (no correction, root cause or actions) and its audit is not yet Reported, and only after you confirm. Anything else is voided with a reason.",
        "Overdue: an audit Planned, In progress or Fieldwork complete past its planned end; an open finding, or an Open or In progress action, past its due date."
      ]
    },
    {
      id: "workflow",
      title: "Lifecycle and statuses",
      bullets: [
        "Programme: Draft to Approved or Cancelled; Approved to In progress or Cancelled; In progress to Complete (date recorded) or Cancelled.",
        "Checklist: Draft, Active or Retired.",
        "Audit: Planned, In progress, Fieldwork complete, Reported, Closed, Cancelled. Moves record the actual start, actual end, report date and issuer, and closing date and closer, and are written to History.",
        "Answer: Not examined, Conformant, Nonconformant, Observation or Not applicable.",
        "Finding: raised Open; saving a correction moves it to Correction proposed. While any action is Open or In progress it is Action in progress; once every action that is not Cancelled is Complete it is Verification, waiting to be checked and closed. It ends Closed or Voided.",
        "Action: Open, In progress, Complete or Cancelled. A Complete action shows Unverified until checked, then Effective or Not effective."
      ]
    },
    {
      id: "reports",
      title: "Dashboard, reports and exports",
      paragraphs: [
        "Delivery is audits Reported or Closed divided by all audits in the programme, cancelled ones included, rounded half up to a whole percent. A programme with no audits shows Nothing planned."
      ],
      bullets: [
        "Dashboard tiles: Audits outstanding (with those past their planned end; a cancellation with no written reason still counts as outstanding), Checklist items unanswered (checklist rows still Not examined across every audit, cancelled audits included; questions never synced into an audit are not counted), Work stopped, still open, and Major nonconformities open.",
        "Dashboard panels: delivery for Draft, Approved and In progress programmes; audits by status; checklist answers with Not examined shown; up to six audits in progress, overdue first; up to six findings needing attention, open stop-work first, then open majors.",
        "Audits and Findings pages have search and filters (Work stopped only on Findings). The Checklist column shows answered out of total, drawn red when any answer is Nonconformant.",
        "Reports: tiles for Audits not delivered, Checklist items unanswered (counted as on the Dashboard), Work stopped, still open and Actions overdue; the audits planned and not delivered; findings by type, by site and by root cause category; open findings past due.",
        "CSV exports on Reports: Programme delivery, Findings and Not delivered (with items unanswered). Each programme, the Audits and Findings pages (rows shown) and each checklist also have Export."
      ]
    },
    {
      id: "limits",
      title: "What the app does not do",
      bullets: [
        "Nothing is stored until the database update for this app (migration 20260917800000) is applied; its catalogue tile is seeded as not yet Active.",
        "Independence between two typed names is judged by the name alone, so spell a person's name the same way each time, or pick them from the Suite members.",
        "Questions cannot be retired one at a time; retire the whole checklist and issue a new version.",
        "Deleting a programme keeps its audits. Audit details cannot be edited after planning, apart from the conclusion and report date.",
        "No attachments, scores, recurring schedules, reminders or PDF reports. History shows the latest 40 entries per record."
      ]
    },
    {
      id: "faq",
      title: "Questions",
      bullets: [
        "Why will my audit not report? An item is unanswered, a failed Critical item has no finding, or the conclusion is missing. The panel What is left before this audit can report names the items, and the notice under the buttons says what else is needed.",
        "Why is Not applicable refused? It needs a reason in the note.",
        "Why can the audit not close? It must be Reported, with its major and stop-work findings closed or voided.",
        "Why can I not delete an audit? Audits are cancelled with a reason.",
        "Why can I not complete the programme? An audit in it is not Reported, Closed or Cancelled.",
        "How does a running audit get new checklist questions? Click Sync protocol.",
        "Why can I not delete a question? An audit has used it. Retire the checklist and issue a new version without it.",
        "Why can I not change an answer? The audit is Reported, so its answers are the report."
      ]
    }
  ],
  glossary: [
    { term: "Programme", definition: "The year's plan of audits, complete when every audit is reported, closed or cancelled." },
    { term: "Checklist", definition: "A reusable protocol of numbered questions." },
    { term: "Criticality", definition: "Critical, Major or Minor. A failed Critical question needs a finding before reporting." },
    { term: "Ad-hoc audit", definition: "An audit with no checklist." },
    { term: "Answer", definition: "The result for one checklist item, with date, evidence and note." },
    { term: "Not examined", definition: "An unanswered checklist item." },
    { term: "Sync protocol", definition: "Adds checklist questions added after the audit was planned." },
    { term: "Lead auditor", definition: "The person responsible for the audit and its report." },
    { term: "Auditee", definition: "The person who answers for the area audited." },
    { term: "Stop-work finding", definition: "A nonconformity for which work was stopped, with the action taken at the time." },
    { term: "Major nonconformity", definition: "Closes on correction, root cause and a verified corrective action." },
    { term: "Minor nonconformity", definition: "Closes once its correction is recorded." },
    { term: "Correction", definition: "What was done about the thing found." },
    { term: "Corrective action", definition: "Removes the cause of a finding." },
    { term: "Effectiveness check", definition: "A dated, named verdict on whether a completed action worked." },
    { term: "Delivered", definition: "An audit Reported or Closed." },
    { term: "Void", definition: "Withdrawing a finding raised in error, with a reason." }
  ]
};
