export default {
  appKey: "iso",
  title: "ISO Compliance",
  summary: "Keep the standards your organization runs, assess each clause against named evidence, run internal audits clause by clause, and carry findings through correction, corrective action and an effectiveness check to closure. Certification readiness is shown as a list of named blockers.",
  sections: [
    {
      id: "purpose",
      title: "What this app is for",
      paragraphs: [
        "ISO Compliance holds four linked registers for each management system standard you run (ISO 9001, 14001, 45001 or any other): the standard and its certificate, its clauses, the internal audits that examine them, and the findings those audits raise with their actions.",
        "It is for the management system lead who owns certification, internal auditors, clause owners, and anyone preparing for a certification or surveillance audit. Every figure is counted from your organization's own records."
      ]
    },
    {
      id: "getting-started",
      title: "Getting started",
      steps: [
        "Open Standards and click Add a standard. Enter the standard as written on the certificate, its title, scope, Certification status and Certification cycle (years), which defaults to 3 and accepts 1 to 6. A Certified standard also needs its Certificate number, Certification body and Certificate expires date. Click Add standard.",
        "Open Clauses and click Add a clause. Pick the Standard and enter the Clause reference, Title, and optionally the requirement, Department, Owner (pick a Suite member, or choose the first option and type the name of somebody without an account) and Review due. For a requirement that does not apply, set Applicability to Not applicable and write why. Click Add clause; Done closes the form.",
        "Click Assess on a clause. Choose the Verdict, name the Evidence, set Assessed on, and leave Assessor blank to record yourself or type the name of the person who assessed it. Click Record assessment. The button stays disabled, with the reason shown, until the verdict has what it needs.",
        "Open Internal audits and click Plan an audit. Enter the Title, Standard, Type, Scope, Lead auditor (a Suite member, or a typed name), dates and criteria, and click Plan audit. The audit is numbered IA-2026-001 and its page opens.",
        "On the audit page click Add clauses, tick the clauses and click Add to scope. Move the audit to In progress.",
        "For each clause click Result, choose the result, set Examined on, note the Evidence seen and click Record result. Recording Nonconformant does not raise a finding.",
        "Click Raise a finding on the audit page. The findings form opens with the audit and its standard selected. Fill in the finding, its Type, Due date, description and Objective evidence, add actions if you have them, and click Raise finding.",
        "On the finding's page, Record the correction and root cause, add and progress actions, record the Effectiveness check, then Close this finding or Void it instead.",
        "Move the audit to Fieldwork complete, click Reported, write the conclusion and click Issue the report. Move it to Closed once its major nonconformities are closed."
      ]
    },
    {
      id: "rules",
      title: "Rules the app enforces",
      paragraphs: [
        "Each rule is checked on the page and again by the database. A refusal says which condition is unmet."
      ],
      bullets: [
        "Conformant or Partially conformant needs an evidence reference, the assessment date and the assessor. Nonconformant needs the date and the assessor. A blank Assessor records you; a typed name records that person. Each assessment records its own assessor, replacing the last one.",
        "Not applicable needs a written justification (ISO 9001:2015 §4.3), and an excluded clause cannot carry a conformity verdict. Applicability is set when the clause is added.",
        "A Certified standard needs a certificate number, a certification body and an expiry date.",
        "A certificate reads as expiring from 90 days before its expiry date, and as expired the day after it. The Standards page shows the date in red with Expiring soon or Expired beside it, and the Dashboard's readiness summary for the standard says the same. Neither is listed as a readiness blocker.",
        "An auditor may not audit their own work (ISO 19011). Adding a clause to an audit's scope is refused when its owner is the lead auditor: the same Suite member, or the same name typed on both. The refusal names the clauses. The database refuses the same Suite member from either direction.",
        "Audit moves: Planned to In progress or Cancelled; In progress to Fieldwork complete or Cancelled; Fieldwork complete to Reported, In progress or Cancelled; Reported to Closed. Audits cannot be deleted.",
        "Reported is refused with no clauses in scope, any clause still Not examined, no conclusion, or no lead auditor. Issue the report is enabled once the conclusion is typed and the rest is in place.",
        "An audit's clause scope is fixed once it is Reported: Add clauses, Result and the remove button are withdrawn, and the app refuses any change, because the scope and its results are what the report said. A register clause that a Reported audit examined cannot be deleted either.",
        "Closed is refused until the audit is Reported, and while a Major nonconformity it raised is open. Minor ones do not block.",
        "A clause result other than Not examined needs its examination date; blank records today.",
        "A finding needs a title, a description and objective evidence. A finding raised against an audit takes the audit's standard unless another is picked. An action needs a description, a type and a due date.",
        "A finding will not close while any action is Open or In progress. A Major or Minor nonconformity needs its correction. A Major one also needs its root cause, a Corrective action that is not Cancelled, and a corrective action verified effective; one found not effective must be followed by another that is verified. Observations and Opportunities for improvement need none of these.",
        "The effectiveness check is available only on a Complete action and records today and you. A not effective verdict needs notes. Voiding a finding needs a reason.",
        "A finding can be deleted only while it is Open with nothing recorded (no correction, root cause or actions) and its audit is not yet Reported, and only after you confirm. Anything else is voided with a reason.",
        "Overdue: an open finding or an Open or In progress action past its due date; an audit still Planned, In progress, Fieldwork complete or Reported past its planned end; an applicable clause past its review date. Reviews are due soon within 30 days.",
        "Coverage counts Internal audits only. A clause is examined when an internal audit recorded any result other than Not examined. It is covered if that date is within the standard's cycle counted back from today, audited before this cycle if older, and never audited if there is none."
      ]
    },
    {
      id: "workflow",
      title: "Lifecycle and statuses",
      paragraphs: [
        "Clause: Not assessed, Conformant, Partially conformant, Nonconformant or Not applicable. A new clause starts Not assessed, or Not applicable if excluded.",
        "Audit: Planned, In progress, Fieldwork complete, Reported, Closed, Cancelled. The moves record the actual start, actual end, report date and issuer, and closing date and closer, and are written to History.",
        "Finding: raised Open. Saving a correction moves it to Correction proposed. While any action is Open or In progress it is Action in progress; once every action that is not Cancelled is Complete it is Verification, waiting to be checked and closed. It ends Closed or Voided.",
        "Action: Open, In progress, Complete or Cancelled, set with the row buttons. A Complete action shows Unverified until its check is recorded, then Effective or Not effective."
      ]
    },
    {
      id: "reports",
      title: "Dashboard, reports and exports",
      paragraphs: [
        "Certification readiness is a list of blockers and carries no percentage. A share of clauses marked compliant by their own owners cannot tell you whether a certification audit will go well; the things that will stop one can be counted and named. Each line is something a certification auditor would raise, with its count.",
        "Blocking: open major nonconformities; applicable clauses never internally audited; clauses claimed conformant without their evidence record; clauses assessed nonconformant; no applicable clauses at all. Serious: clauses audited before this cycle; clauses never assessed; overdue actions. Watch: open minor nonconformities; overdue clause reviews; overdue findings. A standard shows Ready for audit when nothing is blocking; otherwise its badge counts the blocking lines."
      ],
      bullets: [
        "Dashboard: tiles for Applicable clauses, Never internally audited, Claims with no evidence and Major nonconformities open; readiness per standard; clauses by status; internal audit coverage; and the six most urgent findings.",
        "Reports: tiles for Never internally audited, Audited before this cycle, Claims with no evidence and Actions overdue; the coverage gaps table; readiness by standard; findings by type and by department; open findings past due.",
        "CSV exports on Reports: Readiness (standard, severity, count, item), Findings, and Clause coverage (last internal audit, result, covered this cycle). The Clause register, Internal audits and Findings pages each export the rows currently shown."
      ]
    },
    {
      id: "limits",
      title: "What the app does not do",
      bullets: [
        "Nothing is stored until the database update for this app (migration 20260917600000) is applied; until then each page shows a notice.",
        "Evidence is a typed reference. Files are not stored.",
        "Independence between two typed names is judged by the name alone, so spell a person's name the same way each time, or pick them from the Suite members.",
        "A finding raised outside an audit, with no standard picked, is left out of every readiness list.",
        "After adding a clause you can only Assess or Remove it; Remove acts at once and deletes the audit results recorded against that clause. None of these is possible once the audit is Reported. After planning an audit only the conclusion and report date change. On a finding only the correction and root cause change.",
        "Remove on a standard asks first and says what goes: its clauses and the audit results recorded against them are deleted; its audits and findings are kept with no standard and no longer count in any readiness list.",
        "No PDF, reminders or calendar. History shows the latest 40 entries per record."
      ]
    },
    {
      id: "faq",
      title: "Questions",
      bullets: [
        "Why is Record assessment disabled? The verdict needs evidence or a date. The reason shows above the button. A blank Assessor is you.",
        "Why can I not report the audit? A clause in scope is Not examined, the scope is empty, or the conclusion or lead auditor is missing.",
        "Why can I not delete a finding? It has work recorded against it, is past Open, or its audit is reported. Void it with a reason instead.",
        "Why does a certification audit not add coverage? Only Internal audits count.",
        "Why will a major nonconformity not close when its action is Complete? The action must be verified effective, and the correction and root cause written.",
        "Can I exclude a clause later? No. Applicability is set when the clause is added.",
        "Is there an overall compliance percentage? No. Readiness is the list of blockers."
      ]
    }
  ],
  glossary: [
    { term: "Certification cycle", definition: "Years (1 to 6, default 3) over which internal audit coverage is judged." },
    { term: "Clause register", definition: "A standard's clauses with applicability, status, evidence and owner." },
    { term: "Applicability", definition: "Whether a clause applies. Not applicable needs a justification." },
    { term: "Evidence record", definition: "Evidence reference, assessment date and assessor." },
    { term: "Coverage", definition: "Whether an internal audit examined an applicable clause within the cycle." },
    { term: "Scope", definition: "The clauses an audit examines." },
    { term: "Independence", definition: "The ISO 19011 principle that an auditor may not audit their own work." },
    { term: "Major nonconformity", definition: "Blocks certification; closes on correction, root cause and a verified corrective action." },
    { term: "Minor nonconformity", definition: "Closes once its correction is recorded." },
    { term: "Observation", definition: "A concern without a nonconformity." },
    { term: "Opportunity for improvement", definition: "A suggested improvement." },
    { term: "Correction", definition: "What was done about the thing found." },
    { term: "Corrective action", definition: "Removes the cause of a nonconformity." },
    { term: "Preventive action", definition: "Stops the problem arising elsewhere." },
    { term: "Effectiveness check", definition: "A dated, named verdict on whether a completed action worked." },
    { term: "Blocker", definition: "A counted readiness line, graded blocking, serious or watch." },
    { term: "Void", definition: "Withdrawing a finding raised in error, with a reason." }
  ]
};
