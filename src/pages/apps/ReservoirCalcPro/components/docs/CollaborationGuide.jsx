import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Note, Table } from './DocParts';

const CollaborationGuide = () => (
  <Article
    title="Collaboration and Handoff"
    lead="Collaboration in ReservoirCalc Pro is file based. You export a self-contained workspace file and a colleague imports it as a new project. The app says so itself, and this guide explains exactly what works and what does not."
  >
    <H2>What exists today</H2>
    <P>
      The Collaboration and Handoff panel has three parts, and all three do real work.
    </P>
    <UL>
      <li>
        <strong>An identity card.</strong> It shows the email address of the signed-in account and whether
        you are signed in. Saving and sharing projects both require a signed-in account.
      </li>
      <li>
        <strong>Export workspace file.</strong> One button that writes the entire current workspace to a JSON
        file on your machine.
      </li>
      <li>
        <strong>Your projects.</strong> A list of the projects saved under your account, each showing its
        version number and last update date, each with its own <Code>Export</Code> action that writes that
        stored project to a file without opening it first.
      </li>
    </UL>

    <H2>What does not exist</H2>
    <P>
      The app states this in the panel itself, and it is worth repeating plainly. None of the following is
      implemented, and nothing in the interface simulates it.
    </P>
    <UL>
      <li>Live multi-user editing of the same project.</li>
      <li>In-app sharing of a project with another account.</li>
      <li>Invitations, team rosters or role assignment inside the app.</li>
      <li>Presence indicators showing who else has the project open.</li>
      <li>Shared cursors or shared selections.</li>
      <li>Comments, threads or review annotations attached to a model.</li>
    </UL>
    <Note tone="info" title="Why the panel looks the way it does">
      Live editing needs a project-sharing service that is not deployed. Rather than showing a fabricated
      team list or a share button that quietly does nothing, the panel offers the handoff that genuinely
      works and says openly that the rest is unavailable.
    </Note>

    <H2>What the workspace file contains</H2>
    <P>
      The export is a single JSON file with an app and export-date header wrapped around the complete project
      payload. It is self-contained, so the recipient needs no other file and no access to your account.
    </P>
    <Table
      headers={['Carried in the file', 'Detail']}
      rows={[
        ['Project metadata', 'Name, description and version number'],
        ['Deterministic inputs', 'Every analytic and petrophysical input, the fluid type, the contacts and the recovery factors'],
        ['Unit settings', 'The unit system and the per-field display units'],
        ['Method settings', 'The calculation method and the input method'],
        ['Surfaces', 'Every imported surface with its full point set, its XY unit, its Z convention and its CRS'],
        ['AOIs', 'Every area-of-interest polygon with its vertices and computed area'],
        ['Property maps', 'The generated map layers held in the workspace'],
        ['Deterministic results', 'The full result object including warnings and the quality score'],
        ['Monte Carlo results', 'The statistics, the raw realisations, the sensitivity decomposition and the diagnostics'],
        ['Reservoir cases', 'Every reservoir in the project as a full snapshot, plus which one was active'],
        ['Audit trail', 'The complete event log, up to its 200 entry cap'],
      ]}
    />
    <P>
      The filename is built from the project name and version, for
      example <Code>North_Dome_v3.json</Code>. Spaces in the project name become underscores.
    </P>

    <H2>The round trip</H2>
    <OL>
      <li>
        <strong>Save first.</strong> Save the project so it has a name and a version number. The export uses
        both, and saving also fixes the audit trail into the project record.
      </li>
      <li>
        <strong>Export.</strong> Use <Code>Export workspace file</Code> in the Collaboration panel for the
        model currently open, or the <Code>Export</Code> action on a row of the project list for a stored
        project you are not currently editing.
      </li>
      <li>
        <strong>Send.</strong> The JSON file travels by whatever channel you already use, email, a shared
        drive, or a ticket attachment. Surfaces are stored as full point sets, so a large model produces a
        large file. Compress it if your channel has a size limit.
      </li>
      <li>
        <strong>Import.</strong> The recipient opens the Projects panel and imports the file. It is validated,
        then saved under their own account as a new project, named with an <Code>(Imported)</Code> suffix and
        reset to version 1.
      </li>
      <li>
        <strong>Continue.</strong> They open it and the workspace comes back complete: the same inputs, the
        same surfaces, the same AOIs, the same results, and the same audit history that led to them.
      </li>
    </OL>

    <H3>What the import does not preserve</H3>
    <UL>
      <li>
        The original project identifier, creation date and version number. The import deliberately creates a
        new record under the recipient's account, so the two copies are independent from that point on.
      </li>
      <li>
        Any map view saved to the gallery from the visualisation panel. Those live in the browser's own local
        storage on the machine that saved them and never enter the project file.
      </li>
    </UL>

    <H2>Working as a team without live editing</H2>
    <P>
      File exchange is a one-writer-at-a-time model, so the practical discipline is about avoiding two people
      editing forks of the same case.
    </P>
    <UL>
      <li>
        <strong>Agree who holds the pen.</strong> Only one person edits a given case at a time. The other
        reviews the exported file and sends comments back outside the app.
      </li>
      <li>
        <strong>Version in the project name.</strong> The version number increments on every save, and it
        appears in the export filename, so a file name is already a version stamp. Keep the received file
        rather than overwriting it, so the chain stays intact.
      </li>
      <li>
        <strong>Send the report with the file.</strong> A Detailed Audit PDF tells the reviewer what the
        numbers are and how they were produced, before they load anything.
      </li>
      <li>
        <strong>Use reservoir cases for alternatives.</strong> When two people disagree on an interpretation,
        put both readings in the same project as separate reservoir entries rather than exchanging two
        divergent project files.
      </li>
    </UL>
    <Note tone="warn" title="Merging is manual">
      There is no merge. If two people edit copies of the same project, the only way to combine the work is
      for one of them to re-enter the other's changes by hand. Deciding who holds the pen before the work
      starts is cheaper than reconciling afterwards.
    </Note>
  </Article>
);

export default CollaborationGuide;
