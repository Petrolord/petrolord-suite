import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Note, Table } from './DocParts';

const ProjectsGuide = () => (
  <Article
    title="Projects"
    lead="A project is the whole ReservoirCalc Pro workspace written to your account: every reservoir, its inputs, its surfaces, its AOIs, its generated maps, its results and the audit trail. This article covers saving, loading, deleting, the version counter, auto-save, and JSON export and import."
  >
    <H2>Saving</H2>
    <OL>
      <li>Press the green <strong>Save</strong> button in the header. You must be signed in.</li>
      <li>
        The dialog prefills Project Name from the current project metadata, or from the active reservoir name if
        the workspace has never been saved. Name is required, Description is optional.
      </li>
      <li>Press Save. On success you get a toast and the Modified badge clears.</li>
    </OL>
    <P>
      If the save fails, the dialog stays open and shows the reason in a red box inside the dialog, as well as in
      a toast. That is deliberate, because a toast alone is easy to miss behind the overlay.
    </P>
    <Note tone="info" title="Saving folds every reservoir">
      Before writing, the live workspace is folded back into its reservoir entry, so a project always saves every
      reservoir it holds with its latest inputs and results, including the ones that are off screen. See the Multiple
      Reservoirs article.
    </Note>

    <H2>The Modified badge</H2>
    <P>
      The amber <strong>Modified</strong> badge next to the project name means the workspace holds changes that
      are not in the saved record. It is set by any real edit: changing an input, changing unit system, importing
      or removing a surface, creating or deleting an AOI, generating or deleting maps, and adding, switching,
      renaming or deleting a reservoir. It is cleared when a save succeeds and when a project is loaded.
    </P>
    <P>
      Changing calculation Mode, changing Input Method and changing a display unit do not set the badge on their
      own, because they do not alter the stored case values.
    </P>

    <H2>Loading, deleting and starting fresh</H2>
    <P>Open the header <strong>Projects</strong> button for the Project Manager.</P>
    <UL>
      <li><strong>List.</strong> Your saved projects with a search box and a sort control offering Newest First, Oldest First and Name A to Z. Each row shows a version badge and the last modified date.</li>
      <li><strong>Detail.</strong> Selecting a project shows its description, fluid type, and counts of surfaces and polygons.</li>
      <li><strong>Load Project.</strong> Replaces the workspace with that project and clears the Modified badge. It does not prompt about unsaved work, so save first.</li>
      <li><strong>Delete.</strong> Asks for confirmation, then removes the row permanently. There is no undo and no trash.</li>
      <li><strong>New.</strong> Resets the workspace to defaults. If the workspace is modified it asks for confirmation first.</li>
    </UL>

    <H2>Where a project is stored</H2>
    <P>
      Projects live in the Supabase table <Code>saved_quickvol_projects</Code>, the legacy volumetrics store,
      scoped to your account by row level security. Only a few columns are first class. Everything else travels
      in a JSON blob in the <Code>inputs_data</Code> column, which keeps the app independent of optional columns
      on that shared legacy table.
    </P>
    <Table
      headers={['Column', 'Holds']}
      rows={[
        ['id', 'Project identifier.'],
        ['user_id', 'Owner. RLS scopes every read and write to this.'],
        ['project_name', 'The name from the Save dialog.'],
        ['mode', 'The calculation method, deterministic or probabilistic, so central project views can show it.'],
        ['results_data', 'The deterministic results of the active reservoir.'],
        ['inputs_data', 'The full project payload as JSON. See below.'],
        ['created_at', 'Row creation time.'],
      ]}
    />

    <H3>What is inside inputs_data</H3>
    <Table
      headers={['Key', 'Contents']}
      rows={[
        ['description', 'The description from the Save dialog.'],
        ['version', 'Save counter. 1 on create, incremented on every update.'],
        ['inputs', 'Legacy mirror of the ACTIVE reservoir: deterministic inputs, surfaces as an array, polygons and maps.'],
        ['unitSystem', 'field or metric.'],
        ['inputUnits', 'Per field display unit choices for area, thickness, Bg, pressure and temperature.'],
        ['calcMethod', 'deterministic or probabilistic.'],
        ['inputMethod', 'simple, hybrid or surfaces.'],
        ['reservoirName', 'Name of the active reservoir.'],
        ['reservoirs', 'The full array of per reservoir snapshots. This is the real multi reservoir payload.'],
        ['activeReservoirId', 'Which reservoir was open when you saved.'],
        ['probResults', 'The saved Monte Carlo study, so a reloaded project reproduces its P values and its report.'],
        ['auditTrail', 'Chronological action log, newest first, capped at 200 entries.'],
        ['updated_at', 'Timestamp written at save time. The project list sorts on this.'],
      ]}
    />
    <Note tone="warn" title="Surfaces are stored in full">
      Surface point arrays are stored inside the blob, once in the legacy mirror and once per reservoir snapshot.
      A project carrying several dense surfaces becomes a large row and a large JSON export. Delete surfaces you
      no longer need from the Surf tab or the Data Manager before saving.
    </Note>

    <H2>Versioning</H2>
    <P>
      The first save creates the row at version 1. Every subsequent save of the same project increments the
      counter by one, and the new number is shown as a badge in the project list and on the project detail page.
    </P>
    <Note tone="danger" title="The version counter is not a history">
      Saving overwrites the row. Previous versions are not kept anywhere, and there is no way to open version 3
      of a project once version 4 has been written. If you need to preserve a state, either export it to JSON
      before you overwrite it, or keep the alternative as a separate reservoir inside the project.
    </Note>

    <H2>Auto-save</H2>
    <P>
      Workspace Tools then Settings has a switch called <strong>Auto-save after each run</strong>, off by default.
      With it on, the app re-persists a project after a calculation completes.
    </P>
    <UL>
      <li>It only acts on a project that has already been saved once. It never silently creates a new project.</li>
      <li>It requires you to be signed in.</li>
      <li>It is deduplicated on the results object, so one completed run causes at most one save.</li>
      <li>Deterministic runs fire automatically on a debounce, so with auto-save on a stream of edits produces a stream of saves and the version counter climbs quickly.</li>
      <li>An auto-save failure is swallowed silently. Only an explicit Save reports errors.</li>
    </UL>

    <H2>JSON export and import</H2>
    <H3>Export</H3>
    <P>
      Select a project in the Project Manager and press <strong>Export JSON</strong>. The download is named{' '}
      <Code>{'{name}_v{version}.json'}</Code>, with spaces in the name replaced by underscores, so
      Greater Fault Block at version 4 becomes <Code>Greater_Fault_Block_v4.json</Code>. The file wraps the whole
      project payload with a small meta block recording the app name, a format version and the export timestamp.
    </P>
    <H3>Import</H3>
    <P>
      Press <strong>Import</strong> at the top of the Project Manager and pick a file. The importer drops the
      original id and timestamps, appends <Code>(Imported)</Code> to the name, resets the version counter to 1 and
      saves it as a brand new project owned by you. The original is untouched, so importing your own export gives
      you two rows.
    </P>
    <P>
      This is the working handoff mechanism between colleagues. The file carries every reservoir, the surfaces,
      the AOIs, the generated maps, the deterministic results, the Monte Carlo study and the audit trail.
    </P>
    <Note tone="warn" title="Not everything is in the project">
      Two stores sit outside the project record. Views written with <strong>Save View</strong> in the
      visualization panel go to a browser IndexedDB database called <Code>ReservoirCalcProDB</Code>, and your
      preferences go to browser localStorage under <Code>rc_settings_v1</Code>. Neither travels with a saved
      project or a JSON export, and neither syncs to another machine or another browser. Generated property maps
      are different, they are part of the project and do travel.
    </Note>

    <H2>Save errors and what they mean</H2>
    <Table
      headers={['Message', 'Meaning']}
      rows={[
        ['Sign in to save projects.', 'No signed in user. Projects are stored per account.'],
        ['Project name is required.', 'The name field in the Save dialog is empty.'],
        ['Saving is not set up yet, run the create_saved_quickvol_projects migration.', 'The projects table is missing in this environment. Raise it with your administrator.'],
        ['The projects table rejected the save, run the quickvol_projects_relax_legacy_columns migration.', 'A legacy NOT NULL column on the shared table has not been relaxed. Administrator action.'],
        ['Could not load projects', 'The list query failed. The toast carries the underlying reason.'],
      ]}
    />

    <H2>Practical habits</H2>
    <UL>
      <li>Save once early to create the row, then keep saving. Auto-save is only useful after that first save.</li>
      <li>Put the interpretation basis in the Description. It is the only free text the project carries besides the audit trail.</li>
      <li>Export to JSON before any structural change you might want to walk back, since the version counter will not walk it back for you.</li>
      <li>Use the Audit Trail tab in Workspace Tools to see what was actually done in a project you have inherited.</li>
      <li>Keep alternative cases as reservoirs inside one project rather than as many near duplicate projects.</li>
    </UL>
  </Article>
);

export default ProjectsGuide;
