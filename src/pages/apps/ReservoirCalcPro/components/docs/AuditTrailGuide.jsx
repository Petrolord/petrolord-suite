import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Note, Table } from './DocParts';

const AuditTrailGuide = () => (
  <Article
    title="Audit Trail"
    lead="The Audit Trail panel is a real event log. It records what the app did, when, and to what, as you work, and it travels with the project when you save or export it."
  >
    <H2>What gets recorded</H2>
    <P>
      Entries are written by the workspace itself at the moment an action succeeds. Nothing is inferred or
      backfilled, and the list is not a general activity feed. These are the events that produce an entry.
    </P>
    <Table
      headers={['Action', 'Details recorded']}
      rows={[
        ['Surface imported', 'The surface name and its point count'],
        ['Surface removed', 'The name of the surface that was deleted'],
        ['AOI created', 'The AOI name you gave it, or the auto numbered name'],
        ['Property maps generated', 'How many map layers were produced in that generation'],
        ['Project saved', 'The saved project name and its new version number'],
        ['Project loaded', 'The name of the project that was opened'],
        ['New project started', 'No detail, the action itself is the record'],
        ['Reservoir added', 'The name of the new reservoir case'],
        ['Reservoir opened', 'The name of the reservoir you switched to'],
        ['Reservoir deleted', 'The name of the reservoir that was removed'],
        ['Deterministic run', 'The input method used and the fluid type'],
        ['Monte Carlo run', 'The iteration count and the GRV mode, either contact-based GRV or area times thickness'],
      ]}
    />
    <Note tone="info" title="Two entries worth understanding">
      The Monte Carlo entry is the most useful line in the log. It tells a reviewer both how many iterations
      stand behind the P values and whether the gross rock volume came from integrating your surface against
      sampled contacts or from sampled area and thickness. The deterministic entry does the same job for the
      base case by naming the input method.
    </Note>

    <H2>What each entry carries</H2>
    <UL>
      <li><strong>Timestamp.</strong> Recorded in ISO form and displayed in your local date and time format.</li>
      <li><strong>Action.</strong> One of the labels in the table above.</li>
      <li><strong>Details.</strong> The short context string listed alongside the action.</li>
      <li><strong>User.</strong> The signed-in account, shown by email address.</li>
    </UL>
    <P>
      The log is ordered newest first and capped at 200 entries. Once it reaches that cap the oldest entry is
      dropped as a new one arrives, so a long working session keeps its recent history and loses its earliest
      steps.
    </P>
    <Note tone="warn" title="How the User column resolves">
      Entries store the action, the details and the timestamp. The User column is filled in from the account
      signed in when you view or export the log, so a project file passed between two engineers shows the
      current reader in that column rather than the original author of each step. Treat the log as a record of
      what happened to the model, and use the project name and version for authorship.
    </Note>

    <H2>Persistence</H2>
    <P>
      The audit trail is part of the project payload. Saving the project writes the trail into the stored
      project record, and loading a project restores it. Exporting a workspace file carries it too, so a
      colleague who imports your file inherits the whole history along with the model.
    </P>
    <Note tone="danger" title="Before the first save">
      Until you save the project, the trail exists only in the browser tab. A reload, a crash or a closed tab
      loses every entry recorded so far. If a session matters, save the project once early so subsequent saves
      have something to append to.
    </Note>
    <P>
      The <Code>Clear</Code> button empties the log immediately and permanently. There is no undo, and the
      entries are gone from the next save onwards. Export the CSV first if you might need the history.
    </P>

    <H2>Exporting the log</H2>
    <P>
      <Code>Export CSV</Code> writes <Code>reservoircalc_audit.csv</Code> with a Timestamp, Action, Details
      and User column. Timestamps are written in full ISO form for sorting, and every field is quoted so
      details containing commas survive the round trip into a spreadsheet.
    </P>

    <H2>Why this matters for defensibility</H2>
    <P>
      A volumetric number on its own is an assertion. The audit trail is what turns it into a traceable
      result, because the log, the saved project and the report together answer the questions a reviewer
      actually asks.
    </P>
    <OL>
      <li>
        <strong>Which run produced this number?</strong> The Monte Carlo or deterministic entry gives the
        timestamp, the iteration count and the GRV mode of the run that stands behind the reported volume.
      </li>
      <li>
        <strong>What data went in?</strong> The surface import entries give the names and point counts of
        every surface loaded, and the removal entries show what was taken back out.
      </li>
      <li>
        <strong>What was the volume clipped to?</strong> The AOI creation entries show when a boundary was
        introduced, which explains a step change in gross rock volume between two runs.
      </li>
      <li>
        <strong>When was this state fixed?</strong> The project save entries carry the version number, so a
        report can be tied to the exact stored version of the model.
      </li>
    </OL>
    <P>
      Pair the CSV with a Detailed Audit PDF from the same session. The PDF carries the simulation
      diagnostics and the representative P50 realisation inputs, and the CSV carries the sequence of actions
      that led there. Together they let someone else reconstruct how the number was reached without asking
      you.
    </P>

    <H3>A defensible working pattern</H3>
    <OL>
      <li>Save the project as soon as it has a name, so the trail starts persisting.</li>
      <li>Import surfaces and draw AOIs before running, so those entries precede the run entries.</li>
      <li>Run the deterministic base case, then the Monte Carlo study.</li>
      <li>Save again, which stamps a version number into the log next to the runs.</li>
      <li>Export the Detailed Audit PDF and the audit CSV together, and keep them with the project file.</li>
    </OL>
  </Article>
);

export default AuditTrailGuide;
