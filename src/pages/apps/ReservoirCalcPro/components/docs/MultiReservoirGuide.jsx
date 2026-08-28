import React from 'react';
import { Article, H2, P, UL, OL, Note, Table } from './DocParts';

const MultiReservoirGuide = () => (
  <Article
    title="Multiple Reservoirs"
    lead="One project can hold several reservoirs. Each one is a complete workspace snapshot with its own inputs, surfaces, AOIs, maps and results, and the header switcher moves between them without losing anything."
  >
    <H2>What a reservoir entry is</H2>
    <P>
      A reservoir is not just a name and a set of numbers. It is the entire per reservoir slice of the workspace,
      captured whole.
    </P>
    <Table
      headers={['Captured', 'Meaning']}
      rows={[
        ['id and name', 'Identity in the switcher.'],
        ['inputs', 'Every deterministic input, including the fluid contacts and the selected top and base surface ids.'],
        ['surfaces', 'The imported surfaces themselves, with their point data.'],
        ['aois', 'Area of interest polygons drawn for this reservoir.'],
        ['maps', 'Generated property maps.'],
        ['unitSystem and inputUnits', 'Field or metric, plus the per field display unit choices.'],
        ['calcMethod', 'deterministic or probabilistic.'],
        ['inputMethod', 'simple, hybrid or surfaces.'],
        ['results', 'The last deterministic result.'],
        ['probResults', 'The last Monte Carlo study.'],
        ['baseCase', 'The deterministic inputs and results the probabilistic panel centres its distributions on.'],
        ['updated_at', 'When the entry was last folded.'],
      ]}
    />
    <P>
      Because surfaces belong to the entry rather than to the project, two reservoirs in one project can be built
      on entirely different structure maps, in different unit systems, with different input methods.
    </P>

    <H2>The switcher</H2>
    <P>
      The header control sits just right of the project name: a layers icon, a dropdown of reservoirs, then three
      icon buttons.
    </P>
    <Table
      headers={['Control', 'Behaviour']}
      rows={[
        ['Dropdown', 'Selecting a reservoir folds the current workspace away and opens the chosen one, restoring its inputs, surfaces, maps and results.'],
        ['Plus', 'Opens Add Reservoir. The name is prefilled as Reservoir N. Enter confirms.'],
        ['Pencil', 'Opens Rename Reservoir on the reservoir currently open. Enter confirms.'],
        ['Trash', 'Deletes the reservoir currently open, after a confirmation prompt.'],
      ]}
    />
    <P>
      Before you ever use the switcher, the workspace behaves as a single implicit reservoir and the dropdown
      shows one entry named after the current reservoir, or Reservoir 1 when unnamed. The first add, rename,
      switch or save turns that implicit case into a real entry.
    </P>
    <P>
      A new reservoir starts from default inputs with no surfaces, no AOIs, no maps and no results. It inherits
      the current unit system, and it starts on the deterministic method with input method simple. The toast that
      confirms the add reminds you to save the project to keep it.
    </P>
    <Note tone="warn" title="Delete guards, and what delete takes with it">
      Deleting asks for confirmation, and a project must keep at least one reservoir, so deleting the last one is
      refused with the message that a project needs at least one reservoir. Deleting removes the whole snapshot,
      which includes that reservoir surfaces, AOIs, maps and results. If the deleted reservoir was the one open,
      the first remaining reservoir is opened in its place. Deletion is not undoable, and it is committed to the
      record on your next save.
    </Note>

    <H2>Folding, and why nothing is lost</H2>
    <P>
      The workspace always edits the active reservoir directly rather than a copy. Before any switch, add, rename
      or delete, and before every project save, the live workspace is folded back into its own entry. Folding
      overwrites that entry with a fresh snapshot of what is on screen.
    </P>
    <OL>
      <li>You edit reservoir A. The entry for A is now stale, and the truth is on screen.</li>
      <li>You pick reservoir B in the dropdown.</li>
      <li>Everything on screen is written into entry A first, so nothing you did is dropped.</li>
      <li>Entry B is then applied to the workspace, restoring its inputs, surfaces, AOIs, maps, unit system, input method and results.</li>
    </OL>
    <P>
      This is why switching restores results rather than recalculating them. You see the numbers B last produced,
      including its Monte Carlo study, without waiting for a rerun. If the reservoir list is still empty when a
      fold happens, folding creates the first entry from the current workspace, so the implicit case is never lost.
    </P>
    <Note tone="info" title="Switching marks the project modified">
      Any switch, add, rename or delete sets the Modified badge, even when you changed no numbers, because the
      project record no longer matches the workspace. Save to commit the change.
    </Note>

    <H2>Saving and loading a multi reservoir project</H2>
    <UL>
      <li>One Save writes every reservoir. The full array of snapshots goes into the project blob, together with which reservoir was open.</li>
      <li>Loading restores the whole list and reopens the reservoir that was active when you saved, falling back to the first entry if that id is gone.</li>
      <li>The project also mirrors the active reservoir into the legacy top level fields, so older readers and exports still see a sensible single reservoir.</li>
      <li>JSON export and import carry the whole list.</li>
    </UL>
    <P>
      A project saved before multi reservoir support existed loads as exactly one entry, named from the stored
      reservoir name or Reservoir 1. Its surfaces, polygons, maps, results and Monte Carlo study are moved into
      that entry, so a legacy project behaves like any other from the moment it opens.
    </P>

    <H2>Using it for a multi tank field</H2>
    <OL>
      <li>Create one reservoir per tank and name them the way the field does, for example E1000 Sand, E2000 Sand, D5000 Sand.</li>
      <li>Import each tank top surface into its own reservoir, then set Top and, if you have it, Base on the Surf tab.</li>
      <li>Give each tank its own contacts, petrophysics and PVT. Contacts belong to the tank, so do not carry an OWC across from another one.</li>
      <li>Choose the input method per tank. A tank with a mapped top and base can use surfaces while a poorly mapped tank stays on simple.</li>
      <li>Save once. All tanks persist together under one project name and one version counter.</li>
    </OL>
    <Note tone="danger" title="There is no field total">
      The results panel and the results modal always show the reservoir currently open. The app does not sum
      reservoirs into a field total, and it does not aggregate their probabilistic distributions. Adding P50
      volumes across tanks is statistically wrong anyway, so if you need a field number, take each reservoir
      figures out and combine them in the tool that owns that job.
    </Note>

    <H2>Using it for alternative interpretations of one tank</H2>
    <P>
      The same mechanism carries competing views of a single accumulation, which is usually more valuable than a
      folder of near duplicate projects.
    </P>
    <Table
      headers={['Question', 'Set up as']}
      rows={[
        ['How much does the contact really matter', 'Low Case OWC, Base Case OWC and High Case OWC as three reservoirs, identical except for the contact depth.'],
        ['Does the base surface change the answer', 'One reservoir on hybrid with a constant thickness, one on surfaces with the mapped base.'],
        ['What does the segment alone hold', 'One reservoir with no AOI, one with an Active AOI over the segment.'],
        ['Whose structural map do we believe', 'One reservoir per candidate top surface, everything else held constant.'],
        ['Optimistic and pessimistic petrophysics', 'Two reservoirs differing only in porosity, Sw and NTG.'],
      ]}
    />
    <P>
      Because each entry stores its own results, you can move through the dropdown and read the alternatives
      straight off the KPI card without waiting for a recalculation. Write the reasoning into the project
      Description, and check the Audit Trail tab in Workspace Tools, where adding, opening and deleting reservoirs
      are all logged.
    </P>

    <H2>Limits worth knowing</H2>
    <UL>
      <li>There is no duplicate or clone action. A new reservoir starts from defaults, so a variant case has to be re entered or rebuilt from a JSON import.</li>
      <li>Monte Carlo distributions themselves are panel state and fall outside the snapshot. The saved study results are restored per reservoir, but the distribution shapes you typed are rebuilt from the base case when the panel reopens.</li>
      <li>Surfaces are held per reservoir, so using the same surface in three reservoirs stores it three times and inflates the project.</li>
      <li>Nothing compares reservoirs side by side inside the app. The switcher shows one at a time.</li>
      <li>Reservoir names are free text and are not checked for duplicates.</li>
    </UL>
  </Article>
);

export default MultiReservoirGuide;
