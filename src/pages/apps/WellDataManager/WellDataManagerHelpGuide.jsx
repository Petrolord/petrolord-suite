// Well Data Manager in-app help guide (AppUpgrade WDM-U2-003, 2026-09-28).
// Full-page route on the shared HelpGuideLayout shell. Every control named
// here exists in the workstation today; lists that the app computes (the QC
// flags, the depth aliases) are quoted from the code so the guide cannot
// drift from what the app does.
//
// Copy rule: no em dashes, no "X, not Y" contrastives.
// Guard: __tests__/helpGuide.test.jsx.

import SharingHelp from '@/components/recordSharing/SharingHelp';
import React from 'react';
import {
  BookOpen, Zap, Map, Ruler, Upload, GitMerge, Crosshair, Compass, Clock, ClipboardList, Download,
  Share2, Link2, AlertTriangle, BookMarked, Layers, Files,
} from 'lucide-react';
import {
  HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { QC_FLAGS } from './engine/inventory';
import { DEPTH_REF_LABELS } from '@/lib/wellDatum';
import { CURVE_ALIASES } from '@/components/wells/curveMap';

export const APP_PATH = '/dashboard/apps/geoscience/well-data-manager';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Well Data Manager is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start (5 min)' },
  { id: 'map', icon: Map, title: 'Wells, the map and coordinate systems' },
  { id: 'header', icon: Ruler, title: 'Header: depth reference, datum and TVDSS' },
  { id: 'units', icon: Ruler, title: 'Display units: metres or feet' },
  { id: 'las', icon: Upload, title: 'Importing LAS files' },
  { id: 'batch', icon: Files, title: 'Batch LAS import' },
  { id: 'merge', icon: GitMerge, title: 'A LAS into an existing well' },
  { id: 'tops', icon: Crosshair, title: 'Tops' },
  { id: 'zones', icon: Layers, title: 'Zones and computed curves' },
  { id: 'survey', icon: Compass, title: 'Deviation survey' },
  { id: 'checkshots', icon: Clock, title: 'Checkshots' },
  { id: 'inventory', icon: ClipboardList, title: 'Inventory and QC flags' },
  { id: 'export', icon: Download, title: 'Exporting files' },
  { id: 'sharing', icon: Share2, title: 'Private and shared wells' },
  { id: 'links', icon: Link2, title: 'Working with the other apps' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and FAQ' },
  { id: 'glossary', icon: BookMarked, title: 'Glossary' },
];

/** @param {{backTo?: string}} p the harness points Back at /dev */
export default function WellDataManagerHelpGuide({ backTo = APP_PATH }) {
  return (
    <div className="min-h-screen" data-testid="wdm-help-theme-scope">
      <HelpGuideShell
        title="Well Data Manager Help Guide"
        subtitle="The shared well registry every Geoscience app reads"
        metaDescription="How to load LAS files, tops, deviation surveys and checkshots into the Petrolord well registry, read MD, TVD and TVDSS, switch between metres and feet, check the registry with QC flags and export LAS and CSV files."
        backTo={backTo}
        backLabel="Back to Well Data Manager"
        sections={HELP_SECTIONS}
      >
        <GuideSection id="overview">
          <SectionHeading icon={BookOpen}>What Well Data Manager is</SectionHeading>
          <Para>
            Well Data Manager holds the wells of your project once, for every app: the header (name, UWI, surface
            location, coordinate system, KB, TD, status), the deviation survey, the logs, the formation tops, the
            checkshots, interval logs and core photographs. Petrophysics Studio, Well Correlation, Stratigraphy Studio,
            Mapping &amp; Surface Studio, Seismolord and the other apps read these rows directly, so a well loaded
            here appears everywhere with no second import.
          </Para>
          <Para>
            The window has three parts: the wells tree on the left (search, Import LAS, Add well, packages), the
            centre (the map, a well's detail tabs or the registry inventory) and the status bar, which reports what
            the last action did and the depth unit in use.
          </Para>
        </GuideSection>

        <GuideSection id="quickstart">
          <SectionHeading icon={Zap}>Quick start (5 min)</SectionHeading>
          <Step n={1} title="Load a LAS file">Import LAS, choose the file. The preview shows the version, the depth range and step, every curve with its unit and what was converted. Give a new well its name, surface X and Y and the coordinate system, then Import.</Step>
          <Step n={2} title="Check the header">Open the Header tab. Set the depth reference (usually the KB) with its elevation above the vertical datum, and the TD. Without a reference elevation, TVDSS is withheld.</Step>
          <Step n={3} title="Add tops and a survey">On the Tops tab, Edit and type or paste the picks; on the Deviation tab paste MD, inclination and azimuth. The Tops tab then shows MD, TVD and TVDSS side by side.</Step>
          <Step n={4} title="Check the registry">Open Inventory in the ribbon. Every well is listed with its flags: no CRS, depth reference not set, curves stored bottom-up and so on. Click a flag to list the wells that carry it.</Step>
          <Step n={5} title="Use it elsewhere">Open in (ribbon or the well header) takes the well to Petrophysics Studio, Well Correlation, Mapping and the other apps.</Step>
        </GuideSection>

        <GuideSection id="map">
          <SectionHeading icon={Map}>Wells, the map and coordinate systems</SectionHeading>
          <Para>
            Every well stores its surface X and Y in one coordinate reference system (CRS), in that system's own unit
            (metres, feet or US survey feet). The Header tab labels the numbers with both. A well imported without a
            CRS keeps its numbers and shows an Assign CRS link, which declares what the numbers already are and
            transforms nothing.
          </Para>
          <Para>
            The map draws every well with a location. Its caption names the coordinate systems in use, says how many
            wells have no location and are left off, and warns when the wells sit in more than one CRS, because their
            positions are then not comparable on one canvas.
          </Para>
          <Callout tone="info" title="Datum transformations">
            A well published from Well Design Studio carries the site's chosen datum transformation (for example one of
            the published Minna to WGS 84 transformations, which differ by about 10 m). The Header tab names it, and
            every conversion of the well's coordinates uses it: Project CRS reprojection, the map overlays in
            Seismolord and Mapping, and the well door.
          </Callout>
        </GuideSection>

        <GuideSection id="header">
          <SectionHeading icon={Ruler}>Header: depth reference, datum and TVDSS</SectionHeading>
          <Table headers={['Quantity', 'Meaning here']} rows={[
            ['MD', 'measured depth along the hole from the depth reference (the KB on most wells); every log and top is stored against MD'],
            ['Depth reference', 'where measured depth is zero: the kelly bushing (KB), rotary table (RT), drill floor (DF), ground level (GL), mean sea level (MSL), or another point that you name'],
            ['Reference elevation', 'elevation of that point above the vertical datum. Left blank it is "not set", which is different from 0'],
            ['Vertical datum', 'the level the elevations are measured from: MSL, LAT or a named national datum'],
            ['TVD', 'true vertical depth below the depth reference, through the deviation survey (minimum curvature)'],
            ['TVDSS', 'true vertical depth below the vertical datum: TVD minus the reference elevation'],
            ['Elevation', 'the same level counted upwards: minus TVDSS'],
            ['Water depth', 'offshore wells: vertical datum to mudline. The mudline is at TVDSS = water depth; the air gap is the reference elevation'],
            ['Ground level', 'onshore wells: ground elevation above the vertical datum. The depth reference stands above ground by the reference elevation minus the ground level'],
            ['TD', 'total depth, MD'],
          ]} />
          <SubHeading>Setting the depth reference</SubHeading>
          <Para>
            On the Header tab, Edit opens the Depth reference block: what the depths are measured from ({Object.values(DEPTH_REF_LABELS).join(', ')}),
            its elevation, the vertical datum, whether the well is onshore or offshore, and the ground level or the water depth. The unit selector
            sets the unit of what you type; the registry stores metres. Edit also changes the surface X and Y (in the well's CRS, nothing is
            transformed) and the TD.
          </Para>
          <Para>
            A well with no reference elevation says so. Its MD and TVD are shown; TVDSS, elevations and time-depth conversion are withheld in
            every app, with the reason, until the elevation is entered. Nothing assumes 0.
          </Para>
          <SubHeading>Correcting it later</SubHeading>
          <Para>
            Changing the reference elevation of a well that already has tops, curves or checkshots is a correction with consequences. Before
            anything is saved the app lists what moves: by how much every TVDSS shifts, how many tops and curves read at a new subsea depth,
            whether the checkshot table is re-derived (a table entered as MD or TVD is, keeping the reference it was entered in), and what must
            be rebuilt elsewhere (Seismolord synthetics and ties, top maps, flattened sections). You confirm, optionally with the reason, and the
            well keeps a record of who changed it and when; the last changes are listed under the depth reference.
          </Para>
          <SubHeading>What is refused</SubHeading>
          <Para>
            A water depth on an onshore well, a ground level on an offshore well, a negative water depth, an offshore rig floor below the datum,
            a rig floor below ground level, an elevation with no reference kind, and an elevation outside any land or rig elevation (a likely
            unit slip). A negative elevation on land and an elevation of exactly 0 are allowed with a warning.
          </Para>
          <Callout tone="warning" title="An unnamed datum is assumed to be mean sea level">
            Wells saved before the datum model carry one number, the KB, with no datum name. It is read as a kelly bushing elevation above mean
            sea level and the Header says the datum is not named. A KB of 0 on such a well may mean it was never entered; until the registry
            is upgraded the app keeps showing TVDSS equal to TVD for it, with a note, and after the upgrade the well reads as not set.
            The seismic reference datum of a survey is declared in Pore Pressure and Seismolord, the apps that use one; the well does not carry it.
          </Callout>
        </GuideSection>

        <GuideSection id="units">
          <SectionHeading icon={Ruler}>Display units: metres or feet</SectionHeading>
          <Para>
            Depths in (ribbon) switches every depth on screen between metres and feet: the Logs table and the quick
            view, the Tops, Deviation and Header tabs, the wells tree, the inventory and every export. The registry
            always stores metres; only the numbers you read and type convert, with the international foot (exactly
            0.3048 m). The unit starts from your Suite units (Units in the dashboard sidebar); a change here holds for
            this session, and the ribbon says when the view differs from your units.
          </Para>
          <Para>
            Editors take the display unit. A cell you did not change keeps its stored value exactly, so opening a grid
            in feet and pressing Save never moves a top. Switching the unit inside the Header editor converts the
            numbers you typed.
          </Para>
        </GuideSection>

        <GuideSection id="las">
          <SectionHeading icon={Upload}>Importing LAS files</SectionHeading>
          <Para>
            LAS 1.2, 2.0 and 3.0 are read in a background worker. Curves convert to SI on import (feet to metres,
            microseconds per foot to microseconds per metre) and the factor is recorded in each log's provenance.
            A unit the reader does not recognise is imported unchanged and marked as-is.
          </Para>
          <Para>
            While the curves are saved the dialog shows which curve of how many it is on. Stop after this curve ends the
            import cleanly: the curves already saved stay on the well, and the status bar says how many. Every row the
            app writes records the software build that wrote it.
          </Para>
          <SubHeading>The depth index</SubHeading>
          <Table headers={['The file', 'What happens']} rows={[
            ['indexed by MD under any name', `saved as DEPT so every app finds it; these names already count as depth: ${CURVE_ALIASES.DEPT.join(', ')}`],
            ['logged bottom-up (negative STEP)', 'every curve is reversed so depth increases; the preview says so'],
            ['indexed by TVD, TVDSS or time', 'refused with the reason: storing it as MD would put every sample at the wrong depth in a deviated well'],
          ]} />
          <SubHeading>Header values from the file</SubHeading>
          <Para>
            The well name, UWI and TD are suggested from the ~Well section, and XWELL and YWELL (Petrel) or X and Y
            with the unit the file states. The depth reference is proposed from EKB, EGL, EDF, APD, EPD, LMF, DMF and PDAT:
            the dialog shows what it found and what it made of it (for example a permanent datum at ground level, where EPD is
            the ground elevation and APD the KB height above it), flags values that disagree, and leaves out a null value or an
            elevation of 0. It is a proposal: check it, correct it, and it is saved when you import. You still choose the CRS those numbers are in, and the unit selector says
            what the X and Y are in; they convert to the CRS's own unit.
          </Para>
          <SubHeading>LAS 3.0 blocks</SubHeading>
          <Para>
            A Tops block imports as tops (a new well takes them all, an existing well keeps the names it has); core,
            lithology, facies and environment blocks import as interval logs. Other blocks are named in the preview.
          </Para>
          <Para>
            Text channels in the log data ({'{S}'} columns such as a lithology code) import as coded curves: 1, 2, 3 in
            order of first appearance, with the code table kept on the curve (hover its coded text badge). Date-time
            channels ({'{DT}'}, {'{D}'}, {'{T}'}) import as seconds after the first stamp; a stamp with no time zone is
            read as UTC and the preview says so. A column with more than 250 different values is free text and is not
            stored. Codes are never interpolated, so into a well whose depth grid differs from the file's these
            channels are not offered, and the preview says why.
          </Para>
        </GuideSection>

        <GuideSection id="batch">
          <SectionHeading icon={Files}>Batch LAS import</SectionHeading>
          <Para>
            Batch LAS (above the wells tree) reads many files, one after another in the background, and matches each to
            a well: by UWI first (spaces and dashes ignored), then by the well name (case and spacing ignored). The
            review table shows each file, the well it names, its curves, where it will load and why. Change any target
            before importing.
          </Para>
          <Table headers={['The file', 'What the batch does']} rows={[
            ['matches one of your wells', 'loads into it with the merge rules below; a curve name the well already has is kept alongside with a :2 suffix'],
            ['matches a well shared with you read-only', 'skipped, with the reason'],
            ['matches no well', 'creates a new well named from the file (or from the file name when the file has no WELL); it needs a surface X and Y, from the file or typed in the row'],
            ['names the same new well as an earlier file', 'loads into that new well'],
            ['refused by the LAS door, or the same file name twice', 'skipped, with the door\'s message'],
          ]} />
          <Para>
            A file that fails while importing is reported and the batch carries on; files already imported stay. Stop
            after this file ends the run cleanly. The summary lists every file as imported, skipped or failed.
          </Para>
        </GuideSection>

        <GuideSection id="merge">
          <SectionHeading icon={GitMerge}>A LAS into an existing well</SectionHeading>
          <Para>
            The import targets the selected well by default. A well has one depth curve: the incoming curves are
            resampled onto the well's depth grid (linear between neighbouring samples, empty across nulls and outside
            the file's interval). A curve name the well already has is either kept alongside with a :2 suffix or
            replaces the old curve; you choose per curve, and Save as renames any curve before it is written.
          </Para>
        </GuideSection>

        <GuideSection id="tops">
          <SectionHeading icon={Crosshair}>Tops</SectionHeading>
          <Para>
            The Tops tab lists each top with MD, TVD and TVDSS side by side, its surface type, unit, confidence, age
            and interpreter, and a link that maps the top in Mapping &amp; Surface Studio. A dagger marks a top below
            the last survey station, where the path is extended along the final tangent.
          </Para>
          <Para>
            Edit opens a grid: row edits keep each top's id, so Well Correlation keeps its picks. Replace from paste
            reads a table copied from Excel or a Petrel export; a header such as MD (ft) sets the unit.
          </Para>
          <Para>
            After a save, Undo last tops save puts every top of the well back as it was: changed tops return to their
            values with their ids, added tops are removed, and removed tops are re-created. A re-created top has a new
            id, so Well Correlation treats it as a new pick; the status line says how many. Only the last save on the
            selected well can be undone.
          </Para>
          <SubHeading>The tops sheet (every well at once)</SubHeading>
          <Para>
            Tops sheet (ribbon) lists every top of every well you can see, with MD, TVD and TVDSS in the display unit.
            The chips above the table count the wells that carry each top name (hover one to see the wells that do
            not) and filter the table. On your own wells the name and MD are editable in place; Save writes only the
            rows you changed and keeps each top's id.
          </Para>
          <Para>
            Rename changes one top name on every well you own. A well that already has the new name keeps both tops as
            they are and is named in the status bar, and read-only wells are counted. Paste from Excel takes rows of
            well (name or UWI), top name and MD: a top the well already has moves, a new name is added, and every line
            that cannot be used says why (no such well, read-only, not a number, repeated).
          </Para>
        </GuideSection>

        <GuideSection id="zones">
          <SectionHeading icon={Layers}>Zones and computed curves</SectionHeading>
          <Para>
            The Zones tab shows the zones Petrophysics Studio defined on the well, with the summary it published for
            each: gross and net thickness in the display unit, net to gross, and the net-weighted average porosity,
            water saturation and shale volume, the permeability, the date and the interpretation. A zone that was never
            published says so. Zones are read-only here; Open in Petrophysics Studio edits them.
          </Para>
          <Para>
            In the Logs table a curve Petrophysics Studio computed carries a computed badge, and a curve traced from a
            scanned image a digitized badge. Hover the badge for the operation, the interpretation and the inputs.
          </Para>
        </GuideSection>

        <GuideSection id="survey">
          <SectionHeading icon={Compass}>Deviation survey</SectionHeading>
          <Para>
            Stations are MD, inclination and azimuth against grid north. A well with no survey is treated as vertical
            (TVD equals MD). Edit the stations in a grid or replace them from a paste; checkshots entered as MD are
            re-derived through the new survey on save.
          </Para>
        </GuideSection>

        <GuideSection id="checkshots">
          <SectionHeading icon={Clock}>Checkshots</SectionHeading>
          <Para>
            Enter checkshots the way Petrel exports them: the depth as MD, TVD or TVDSS, in metres or feet, with one-way
            or two-way time. They are stored as TVDSS and two-way time with the convention you entered, and the tab
            shows them back in any convention with View as.
          </Para>
        </GuideSection>

        <GuideSection id="inventory">
          <SectionHeading icon={ClipboardList}>Inventory and QC flags</SectionHeading>
          <Para>
            Inventory (ribbon) lists every well you can see with its CRS, KB, TD, survey, checkshots, curve and top
            counts and the interval logged, and raises these flags. Warnings mean a result downstream is wrong or
            missing until the flag is fixed; information flags are worth knowing.
          </Para>
          <Table headers={['Flag', 'Level', 'Why it matters', 'Where to fix it']}
            rows={QC_FLAGS.map((f) => [f.label, f.level === 'warn' ? 'warning' : 'information', f.why, f.fix])} />
          <Para>Click a flag to list only the wells that carry it. CSV writes the table in the display unit.</Para>
        </GuideSection>

        <GuideSection id="export">
          <SectionHeading icon={Download}>Exporting files</SectionHeading>
          <Table headers={['Format', 'What it holds']} rows={[
            ['LAS 2.0', 'the depth curve and the curves you tick, depth in the display unit, curve values in their stored units; the header carries the well name, UWI, KB (EKB), TD, X, Y and CRS'],
            ['Tops CSV', 'well, UWI, top, MD, TVD and TVDSS in the display unit, type, unit, confidence, age, interpreter'],
            ['Survey CSV', 'MD, inclination, grid azimuth, TVD, TVDSS and the East and North offsets from the wellhead'],
            ['Well data sheet (PDF)', 'one printable summary for a meeting pack or a reviewer: identity (well, UWI, status, CRS, X and Y, datum transformation), the depth unit, the datum assumption, KB, TD, survey and checkshot summary, QC flags, who prepared it (Prepared by), the date and the software build, then the tops with MD, TVD and TVDSS, the curve inventory with each curve\'s origin, and the Petrophysics zones'],
          ]} />
          <Para>
            Every depth column names its unit in its header, so the file reads back into this app, Petrel or Techlog
            without guessing. A curve sampled on a different depth grid cannot share the LAS depth column; the
            dialog names it and the reason. The .pld package (Export package) remains the way to move whole wells
            between Petrolord projects.
          </Para>
        </GuideSection>

        <GuideSection id="sharing">
          <SectionHeading icon={Share2}>Private and shared wells</SectionHeading>
          <Para>
            A new well is private. Share with organization (right-click a well) lets your organization's members read
            it; only the owner edits it. Shared wells from teammates appear in your tree marked org and open read-only.
          </Para>
        </GuideSection>

        <GuideSection id="links">
          <SectionHeading icon={Layers}>Working with the other apps</SectionHeading>
          <Table headers={['App', 'What it reads from here', 'What it writes back']} rows={[
            ['Petrophysics Studio', 'logs, tops, survey, KB', 'computed curves, zones'],
            ['Well Correlation', 'logs and tops', 'tops it picks or drags'],
            ['Stratigraphy Studio', 'tops, intervals', 'typed surfaces, interval logs, core photos'],
            ['Mapping & Surface Studio', 'locations and tops (TVDSS)', 'surfaces (in its own registry)'],
            ['Seismolord', 'wells, survey, checkshots, tops', 'a tie-derived time-depth set'],
          ]} />
                <SharingHelp record="well" where="Open the well: the control is above its tabs. The tree's share button still shares or unshares a well in one click, for viewing.">
          <Para>
            Team editing covers the whole well: the header, deviation, checkshots, tops, logs, zones, intervals and core photos all follow the well's editing session.
            While a colleague is editing, the owner's other apps (Petrophysics, Well Correlation and the rest) cannot write to that well either, and say who is editing.
            There is no Save a copy for a well; use Export or a project package to copy one.
          </Para>
        </SharingHelp>
      </GuideSection>

        <GuideSection id="pitfalls">
          <SectionHeading icon={AlertTriangle}>Pitfalls and FAQ</SectionHeading>
          <SubHeading>TVDSS equals TVD on my well</SubHeading>
          <Para>The well was saved before the datum model with a KB of 0. Set the reference elevation on the Header tab; the Tops tab says so when it is missing.</Para>
          <SubHeading>TVDSS shows n/a on my well</SubHeading>
          <Para>The well has no reference elevation, so its subsea depths cannot be given. Set it on the Header tab, Depth reference.</Para>
          <SubHeading>My LAS file is refused</SubHeading>
          <Para>
            The message names the reason: a TVD, TVDSS or time index, a malformed row with its line number, or a
            comma used as the decimal mark. Export the logs against MD with a point decimal and import again.
          </Para>
          <SubHeading>The Logs tab says curves were stored bottom-up</SubHeading>
          <Para>
            A release before September 2026 stored files logged bottom-up as they came, with depth decreasing. The quick
            view already shows them with depth increasing; Reorient (owner only) reverses them in place so every app
            reads them that way. The curves keep their ids, so Petrophysics and Well Correlation still find them.
          </Para>
          <SubHeading>A well is missing from the map</SubHeading>
          <Para>It has no surface location. The map caption counts such wells; the inventory flags them.</Para>
          <SubHeading>My checkshot depths are negative</SubHeading>
          <Para>
            They are elevations (Petrel Z, negative down). In Replace from paste (and in Add well), tick Z is an
            elevation: the values are read as TVDSS with the sign flipped, and the table records that it was entered
            that way.
          </Para>
          <Callout tone="info" title="Values in formulas">
            TVDSS is computed as <Code>TVDSS = TVD - KB</Code> (KB standing for the elevation of whichever depth reference the well states), in one shared module that every app reads through; feet convert as <Code>ft = m / 0.3048</Code>.
          </Callout>
        </GuideSection>

        <GuideSection id="glossary">
          <SectionHeading icon={BookMarked}>Glossary</SectionHeading>
          <Table headers={['Term', 'Meaning']} rows={[
            ['CRS', 'coordinate reference system: the projection and datum the X and Y are in'],
            ['DEPT', 'the depth curve every app reads'],
            ['KB', 'kelly bushing: the depth reference at the rig floor'],
            ['LAS', 'Log ASCII Standard (CWLS), versions 1.2, 2.0 and 3.0'],
            ['MD', 'measured depth along the hole'],
            ['OWT, TWT', 'one-way and two-way seismic travel time'],
            ['TVD, TVDSS', 'true vertical depth below the KB, and below the datum'],
            ['UWI', 'unique well identifier'],
          ]} />
        </GuideSection>
      </HelpGuideShell>
    </div>
  );
}
