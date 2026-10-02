import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Note, Table } from './DocParts';

const CollaborationGuide = () => (
  <Article
    title="Collaboration and Handoff"
    lead="A saved project can be shared with your organisation from the Share button in the header: colleagues view it, or edit it one person at a time, and every change carries its author. A self-contained workspace file still hands a project to someone outside your organisation. This guide explains both."
  >
    <H2>Sharing with your organisation</H2>
    <P>
      Save the project, then press <Code>Share</Code> in the header. A bar opens under the header for the project that is open.
    </P>
    <UL>
      <li>
        <strong>Share with my organisation.</strong> Every member of your organisation can open the project. It stays
        private until you switch this on, and only you can switch it off or delete the project.
      </li>
      <li>
        <strong>Colleagues can view.</strong> They open it read-only (a Read-only badge shows beside the name) and
        use <Code>Save a copy</Code> to work on a version of their own.
      </li>
      <li>
        <strong>Colleagues can edit.</strong> One person at a time. Whoever wants to edit presses <Code>Start editing</Code>;
        everyone else sees who is editing and since when, and stays read-only until that person presses <Code>Done editing</Code>.
        A session also ends when the project is closed, or 30 minutes after the last save. The owner can press <Code>Take over</Code>.
      </li>
      <li>
        <strong>No silent overwrite.</strong> If someone saved a newer version after you opened the project, your save is
        refused with their name and the time. Reload, or save yours as a copy.
      </li>
      <li>
        <strong>History.</strong> Who created, shared, edited and saved the project, and when. Names are shown inside your organisation only.
      </li>
      <li>
        <strong>Projects panel.</strong> Your projects first, then <Code>Shared with me</Code> with who shared each one.
      </li>
      <li>
        <strong>Prospects.</strong> Each inventory row has a share button, for viewing. Prospects colleagues shared are listed
        under the inventory, left out of your portfolio, and <Code>Save a copy</Code> adds one to your inventory.
      </li>
    </UL>
    <Note tone="info" title="When the control shows a note instead">
      If the bar says sharing is not switched on for this database yet, the database is waiting for an update.
      Everything stays private and saving works as before.
    </Note>

    <H2>The Collaboration and Handoff panel</H2>
    <P>
      The panel has three parts, and all three do real work.
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
      None of the following is implemented, and nothing in the interface simulates it.
    </P>
    <UL>
      <li>Two people editing the same project at the same moment.</li>
      <li>Sharing with one named colleague, or with another organisation.</li>
      <li>Shared cursors or shared selections.</li>
      <li>Comments, threads or review annotations attached to a model.</li>
    </UL>

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

    <H2>Working as a team with files</H2>
    <P>
      Inside your organisation, share the project and let one person edit at a time. File exchange, for people
      outside it, is also a one-writer-at-a-time model, so the practical discipline is about avoiding two people
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
