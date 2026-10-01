// Wellsite Studio help guide (WS9). Quotes the live vocabulary from the
// engine (sample stages, event types, observation types, show
// qualities, top statuses, roles) so it cannot drift from what the app
// stores. Copy rule: no em dashes, no "X, not Y" contrastives; the app
// detects, highlights, presents and records, and never claims to decide.

import React from 'react';
import {
  BookOpen, Zap, WifiOff, HardHat, Settings, Activity, FlaskConical, PenLine, Droplets, Eye, Camera, Tags, ListOrdered,
  ClipboardList, FileText, RefreshCw, Upload, AlertTriangle, ListChecks, FileUp, Compass, LineChart,
} from 'lucide-react';
import { HelpGuideShell, GuideSection, SectionHeading, SubHeading, Para, Code, Callout, Step, Table } from '@/components/helpguide/HelpGuideLayout';
import { SAMPLE_STAGES } from '@/lib/wellsite/sampleProgram';
import { EVENT_TYPES } from '@/lib/wellsite/events';
import { SHOW_QUALITIES } from '@/lib/wellsite/shows';
import { TOP_STATUSES } from '@/lib/wellsite/tops';
import { ATTRIBUTES } from '@/lib/wellsite/descriptionVocabulary';
import { DEPTH_KINDS, DEPTH_DATUMS } from '@/lib/wellsite/depth';
import { OBSERVATION_TYPES } from './services/observations';
import { WS_ROLES } from './services/vocab';

const APP_PATH = '/dashboard/apps/geoscience/wellsite-studio';

export const HELP_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What Wellsite Studio is' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'offline', icon: WifiOff, title: 'Working without a connection' },
  { id: 'setup', icon: HardHat, title: 'Starting a live well' },
  { id: 'config', icon: Settings, title: 'Configuration' },
  { id: 'live', icon: Activity, title: 'The Live view and depths' },
  { id: 'samples', icon: FlaskConical, title: 'Lag and samples' },
  { id: 'describe', icon: PenLine, title: 'Describing cuttings' },
  { id: 'shows', icon: Droplets, title: 'Shows' },
  { id: 'observations', icon: Eye, title: 'Observations' },
  { id: 'photos', icon: Camera, title: 'Photographs' },
  { id: 'import', icon: FileUp, title: 'Importing mudlogging data' },
  { id: 'surveys', icon: Compass, title: 'Surveys on the rig' },
  { id: 'log', icon: LineChart, title: 'The strip log and the d-exponent' },
  { id: 'tops', icon: Tags, title: 'Formation tops' },
  { id: 'timeline', icon: ListOrdered, title: 'The timeline' },
  { id: 'handover', icon: ClipboardList, title: 'Shift handover' },
  { id: 'report', icon: FileText, title: 'Daily report and sign-off' },
  { id: 'sharing', icon: RefreshCw, title: 'Sharing and conflicts' },
  { id: 'publish', icon: Upload, title: 'Publishing to the registry' },
  { id: 'pitfalls', icon: AlertTriangle, title: 'Pitfalls and language' },
  { id: 'glossary', icon: ListChecks, title: 'Glossary' },
];

export default function WellsiteHelpGuide() {
  // Design system rollout W4A: the guide shares the app's theme scope, so
  // the user's light or dark choice holds between the app and its guide.
  return (
    <div className="min-h-screen" data-testid="ws-help-theme-scope">
    <HelpGuideShell
      title="Wellsite Studio Help Guide"
      subtitle="The geological record of a live well, on the rig and in the office"
      metaDescription="How to run a well from Wellsite Studio: lag and samples, cuttings descriptions, shows, observations, photographs, formation tops, the timeline, shift handovers, daily reports and sign-off, sharing without a connection, and publishing to the Petrolord well registry."
      backTo={APP_PATH}
      backLabel="Back to Wellsite Studio"
      sections={HELP_SECTIONS}
    >
      <GuideSection id="overview">
        <SectionHeading icon={BookOpen}>What Wellsite Studio is</SectionHeading>
        <Para>
          Wellsite Studio is the geological command centre for a live well. From the prognosis to TD it holds what the geologist saw
          (observations), what they thought it meant (interpretations), what happened on the rig (events) and what was called
          (decisions) as one traceable record, and it generates the shift handover and the daily geological report from that record so nobody types them a second time.
        </Para>
        <Para>
          It is not a mudlogging acquisition system, a drilling or well-control system, or a decision maker. It detects, highlights,
          presents and records; the geologist makes every call. Everything works without a connection, and the record shares with
          the office when one returns, without any version overwriting another.
        </Para>
        <Para>
          Enter information once. The same record serves the Live view, the samples board, the handover, the daily report and,
          once published, Well Correlation, Petrophysics Studio and Stratigraphy Studio through the shared well registry.
        </Para>
      </GuideSection>

      <GuideSection id="quickstart">
        <SectionHeading icon={Zap}>Quick start (one shift)</SectionHeading>
        <Step n={1} title="Open the well with a connection once">Pick the live well in the explorer, or start one from a registry well with New well. Click the sharing pill and choose Keep offline so the app itself opens without a connection.</Step>
        <Step n={2} title="Check the rig configuration">In Config confirm the hole sections, the drillpipe and BHA, and the pump. The lag readout in the dock follows from these.</Step>
        <Step n={3} title="Record the bit depth and the pumps">On Live, enter the bit depth with its unit, reference and datum, and record the pump rate. The lagged sample depth and the next sample follow.</Step>
        <Step n={4} title="Catch and describe">On Samples, catch a sample when it is due and describe it. Copy previous (Ctrl+D) and change only what differs.</Step>
        <Step n={5} title="Record shows, observations, photographs and events">Each is one screen away; each carries its depth, time and user automatically.</Step>
        <Step n={6} title="Watch the approach">The dock shows the next prognosed top, its uncertainty window and the offsets. Interpret, then call the top on Tops.</Step>
        <Step n={7} title="Hand over">On Handover the tour's record is already there. Write the summary and the watch items, sign, export.</Step>
      </GuideSection>

      <GuideSection id="offline">
        <SectionHeading icon={WifiOff}>Working without a connection</SectionHeading>
        <Para>
          Every entry is saved on this device first and shared later. The pill in the ribbon says what is waiting, what was refused,
          and whether there are conflicts; click it for the drawer. Nothing you do depends on the link: descriptions, samples, lag,
          tops, observations, interpretations, events, decisions, the handover and the daily report all work offline.
        </Para>
        <Callout tone="warning" title="Two things to do once, with a connection">
          Install the Suite as an app (the browser's Install option) so the device protects its storage, and click Keep offline in
          the sharing drawer so the app's own files are cached. Without those the browser may evict unsynchronised work under disk
          pressure and the app cannot load without a link.
        </Callout>
        <Callout tone="info" title="Encryption">
          Release 1 relies on the device's disk encryption (BitLocker or equivalent) for the record held on the laptop. Sync is over
          TLS, sessions are authenticated, and the record itself is append-only.
        </Callout>
        <Para>
          Licences are checked with a connection and remembered for thirty days, so a rig laptop that boots offline still opens the
          app; a banner says the licence was last verified on a date.
        </Para>
      </GuideSection>

      <GuideSection id="setup">
        <SectionHeading icon={HardHat}>Starting a live well</SectionHeading>
        <Para>
          A live well is anchored to a registry well from Well Data Manager (its name, KB and survey come from there). New well needs
          a connection; whoever starts it is its first administrator and adds the other members with their roles:
          {' '}{WS_ROLES.map((r) => r.name.toLowerCase()).join(', ')}. Which roles may approve (finalise a top, resolve a conflict) is
          a setting per well and is never a fixed title.
        </Para>
        <Para>
          Members are kept on Config, under Members. An administrator of the well, or of the organisation, adds a person from the
          organisation with a role, changes a role, or makes a member inactive. Nobody is deleted, so a member who leaves keeps their
          name on what they recorded, and the well always keeps one active administrator. Changing members needs a connection.
        </Para>
        <Para>
          Open in from Well Data Manager opens the live well of that registry well. When the registry well has no live well yet, New
          well opens with it already chosen.
        </Para>
        <Para>
          The prognosis is loaded on Tops with Load from registry: the well's own tops, the offset wells' tops through their own
          surveys, and Well Design's hole sections and definitive trajectory when the well is linked. Each load is a new numbered
          version with its date, shown at the top of the Tops view. Choose the offset wells under Offset wells beside the button before
          loading; the choice starts from the last version's. A prognosis top can also be added by hand; that is a new version too.
        </Para>
      </GuideSection>

      <GuideSection id="config">
        <SectionHeading icon={Settings}>Configuration</SectionHeading>
        <SubHeading>Rig geometry and pump</SubHeading>
        <Para>
          Hole sections with their inside diameter (the casing ID where cased), the bottom hole assembly bit up, the drillpipe, and the
          pump (liner, stroke, rod for a duplex, efficiency; the displacement shows live). Saving records a dated configuration and keeps
          the earlier ones: a casing run or a BHA change is something that happened.
        </Para>
        <SubHeading>Well settings</SubHeading>
        <Para>
          The rig's offset from UTC, the tour start times, the report day start, the overdue tolerance, the default depth entry, the
          mandatory sample stages, the approver roles, whether original photographs are kept, the operator abbreviation profile and the
          operator daily report template. An administrator changes these.
        </Para>
      </GuideSection>

      <GuideSection id="live">
        <SectionHeading icon={Activity}>The Live view and depths</SectionHeading>
        <Para>
          No depth is ever bare. Every depth is entered with a value, a unit (m or ft), a reference (MD, TVD or TVDSS) and a datum
          ({DEPTH_DATUMS.join(', ')}), and stored as metres MD below KB with the calculated TVD and subsea depth, the survey version
          and the method. An incomplete entry is refused and the reason named. Depth kinds: {DEPTH_KINDS.map((k) => k.replace(/_/g, ' ')).join(', ')}.
        </Para>
        <Para>
          A TVD entered on a deviated well resolves through the survey; where the path crosses that TVD more than once the app asks for
          MD. Beyond the last survey station the TVD is extrapolated along the last attitude and says so.
        </Para>
        <Para>
          Every record carries UTC and the rig's offset; tours and the report day are computed from the rig offset and never from the laptop's clock zone.
        </Para>
      </GuideSection>

      <GuideSection id="samples">
        <SectionHeading icon={FlaskConical}>Lag and samples</SectionHeading>
        <Para>
          Lag is counted in pump strokes: the annular volume from the bit to surface over the pump displacement. Time follows the pump
          log (rate changes, connections, shutdowns included), so the lag panel shows the lag strokes, the lag time at the current rate,
          the lagged sample depth now, and the bottoms-up time. With the pumps off the lag time is undefined and the panel says so.
          Between two bit depths the bit is taken to drill steadily, except through connections, trips, circulation, sweeps, casing and
          logging on the timeline, when it is held where it was, so start and end those events as they happen.
        </Para>
        <Para>
          The panel also shows the annular volume from the bit to surface, the pump output per stroke and the flow now, in barrels or
          cubic metres after your Suite units, so the geometry can be checked against the driller's figures. Live shows the rate of
          penetration from the last two bit depths over drilling time only. In Config, sizes can be typed the way they are written on
          the rig (12 1/4, 8-1/2), lengths follow the depth unit, and Fill from Well Design brings in the casing programme loaded with
          the prognosis for you to check before recording.
        </Para>
        <Para>
          On a drillship or a semi-submersible the returns travel up the marine riser above the BOP, and the booster pump adds mud at
          the riser base, so the lag runs in two legs: bit to BOP on the main pump alone, riser to surface on main plus booster. Set the
          rig type in Config, enter the BOP depth below the rotary table and the riser inside diameter, describe the booster pump, and
          enter the hole sections from the BOP down. Record the booster rate beside the main rate on every pump change; the panel shows
          the riser leg's share of the lag. A land rig, jack-up or platform has neither and the lag is the single leg it always was.
        </Para>
        <SubHeading>Lag check and washout</SubHeading>
        <Para>
          A calculated lag assumes a gauge hole. To check it, drop carbide (or rice, or a paint marker) into the pipe at a
          connection, count the pump strokes until it comes back, and type the count under Lag check and washout in the dock. The
          strokes it took to travel down the string (the inside volume of the pipe and collars over the pump output, plus a surface
          line if you enter one) are taken off the count; what is left is the measured lag. The panel shows it beside the calculated
          lag, the difference in strokes and in volume, the washout as a percent of the gauge open hole volume, and the equivalent
          hole diameter.
        </Para>
        <Para>
          Record check keeps the count as it was made. Record and apply washout also corrects the lag: the open hole is enlarged by
          that percent for the lag strokes, the sample arrival times and the lagged depth, and the lag panel says it is corrected.
          Cased hole and the riser are steel and are never enlarged. A later check always measures against the gauge hole, so one
          washout is never stacked on another. A caliper figure can be applied by hand, and Clear returns to the gauge hole; each is
          a new version on the record. A count shorter than the calculated lag is not a washout: the panel says to check the pump
          output, the sizes and the count, and corrects nothing.
        </Para>
        <Para>
          The sampling programme (an interval per depth range) is an authorised decision; changing it needs the person who authorised
          it and makes a new version. Samples are scheduled three intervals ahead of the bit, with their predicted arrival, starting from
          the bit depth when that version was authorised (depths drilled before it are not scheduled). A sample not
          confirmed within the tolerance of its predicted arrival is highlighted as overdue for review; the app never says it was missed,
          because it cannot know.
        </Para>
        <Table headers={['Stage', 'Meaning']} rows={SAMPLE_STAGES.map((s) => [s, s === 'scheduled' ? 'programmed and not yet cut' : s === 'due' ? 'predicted at surface' : `recorded by a person, with the time`])} />
        <Para>Mandatory stages (a well setting) cannot be skipped; the others can.</Para>
      </GuideSection>

      <GuideSection id="describe">
        <SectionHeading icon={PenLine}>Describing cuttings</SectionHeading>
        <Para>
          A description is a list of components, each a lithology with a percent and its attributes in this order:
          {' '}{ATTRIBUTES.map((a) => a.label.toLowerCase()).join(', ')}. Quick mode shows the common attributes; F2 shows them all.
          The structured record is what is stored; the abbreviation string and the narrative are renderings of it.
        </Para>
        <Para>
          Keyboard first: Tab or Enter moves to the next field and resolves what you typed against the vocabulary (sst, lt gy, f-m,
          sbang-sbrnd, tr pyr); an unknown term keeps its text and turns amber with the reason. Ctrl+Enter adds a component, Ctrl+D copies
          the previous description so you change only what differs (changed fields are highlighted), Alt+n jumps to component n,
          Ctrl+S saves, Esc discards.
        </Para>
        <Para>
          The abbreviation profile is the operator's house style over the same stored codes; a term the profile does not define shows
          from the Petrolord default and the screen says how many. Percentages must sum to 100 within a tolerance; the save is refused
          otherwise with the exact sum.
        </Para>
      </GuideSection>

      <GuideSection id="shows">
        <SectionHeading icon={Droplets}>Shows</SectionHeading>
        <Para>
          Fluorescence (colour, intensity, distribution), cut (speed, type, colour), stain, odour and residue are controlled values.
          The quality ({SHOW_QUALITIES.map((q) => q.name).join(', ')}) is derived from them by a fixed scoring rule and is never typed;
          the wording lists indicators and never claims that oil or gas is proven.
        </Para>
      </GuideSection>

      <GuideSection id="observations">
        <SectionHeading icon={Eye}>Observations</SectionHeading>
        <Para>
          Release 1 records selected rig and geological observations by hand: {OBSERVATION_TYPES.map((o) => o.name.toLowerCase()).join(', ')}.
          Each has a value with a unit or a description, the depth it refers to (the lagged sample depth now, the bit depth now, a typed
          depth, or none) and its source (manual or externally observed). Continuous mudlogging and LWD feeds are Release 2.
        </Para>
        <Para>
          Observations are immutable. To correct one, record the correction; the earlier observation stays in the audit view as superseded.
        </Para>
        <SubHeading>Chromatograph readings and gas ratios</SubHeading>
        <Para>
          Choose Chromatograph on the Observations view and type C1, C2, C3, iC4, nC4, iC5 and nC5 as read, in ppm, percent or
          chromatograph units. All seven share one unit; a component that was not read is left empty. Before you save, the app
          shows the Haworth ratios (wetness, the heavier gases as a percent of the total; balance, C1 plus C2 over C3 plus C4 plus
          C5; character, C4 plus C5 over C3) and the Pixler ratios (C1 over C2, C3, C4 and C5), each with its reading: very dry
          gas, gas, wet gas or condensate, gas with oil, oil or residual oil from Haworth; oil, gas or non-productive from C1 over
          C2, with a note when a ratio falls below the one before it. Recorded readings are listed in a gas table with their
          ratios.
        </Para>
        <Callout tone="info" title="An indication from the gas alone">
          The ratios are a reading of the gas, to be weighed with the cuttings, the shows and the drilling data. A ratio whose
          denominator was not read is shown as n/a with the reason; nothing is filled in for it. Shale density can be recorded in
          g/cc, sg or kg/m3.
        </Callout>
      </GuideSection>

      <GuideSection id="photos">
        <SectionHeading icon={Camera}>Photographs</SectionHeading>
        <Para>
          From the camera, a microscope camera or a file. The device makes a thumbnail and a working image; the original is kept only
          when the well says so. A photograph inherits the well, the sample when chosen, the depth, the user and both times, and then
          appears in the sample, the handover and the report without being attached again. The sharing drawer counts photographs not yet
          backed up.
        </Para>
      </GuideSection>

      <GuideSection id="import">
        <SectionHeading icon={FileUp}>Importing mudlogging data</SectionHeading>
        <Para>
          The Import view reads what the mudlogging unit exports: a CSV, a text file separated by tabs, semicolons or spaces, or a
          LAS file (2.0 or 3.0), indexed by depth or by time. Choose the file or paste the table. The app shows every column it
          found, the unit written in the file, and the first values, and suggests what each column is: hole depth, bit depth, date
          and time, rate of penetration, weight on bit, rotary speed, torque, standpipe pressure, flow, pump strokes, mud weight,
          ECD, total gas, C1 to C5 and bit size.
        </Para>
        <Para>
          Nothing is stored until every column you keep has its unit declared and the depths have their datum (KB, RT, GL or MSL).
          A unit found in the header only fills the choice in for you to check. A time file also asks whether dates are day first or
          month first, and whether the clock is rig time or UTC. The preview then says how many rows will be imported, over what
          depths, which rows were not read and why, and which values were left out as impossible. If most of a column falls
          outside its possible range, the import stops and says the declared unit looks wrong.
        </Para>
        <Para>
          From a time file you can also record the bit depths and the pump rate changes for the lag, marked externally observed.
          Imported rows feed the strip log and the d-exponent. Every import is listed with what was declared; Withdraw takes its rows
          out of use, with your reason, and keeps the record of it. One row of drilling parameters can be typed on the same view.
        </Para>
        <Callout tone="info" title="Depths are measured depths">
          The importer reads measured depth. Rows are kept as recorded and work without a connection like every other record.
        </Callout>
      </GuideSection>

      <GuideSection id="surveys">
        <SectionHeading icon={Compass}>Surveys on the rig</SectionHeading>
        <Para>
          A live well starts with the survey the registry held when it was created. As MWD surveys are taken, record them on the
          Surveys view: type one station (measured depth, inclination, azimuth), or paste or load a table of stations. Each time,
          declare the unit of the measured depths and the north the azimuths are measured from. Grid north needs nothing more;
          for true or magnetic north enter the correction to grid, which is added to every azimuth.
        </Para>
        <Para>
          A station below the survey in use is tied in to its last station. A run that starts at or above an existing station
          replaces the survey from there down and keeps what is above, so a corrected survey is recorded the same way. Runs are
          kept; the last one recorded wins. The view lists the stations in use with TVD, subsea depth, northing, easting and
          dogleg severity by minimum curvature, the same survey table the Drilling apps use.
        </Para>
        <Para>
          From then on every TVD and subsea depth on screen is calculated with the survey in use: Live, the tops against the
          prognosis, the approach panel and the lag. A depth recorded earlier keeps its measured depth; its TVD is recalculated on
          screen and the value recorded at the time is shown beside it. A depth that was entered as TVD or TVDSS is listed with the
          measured depth the survey in use gives it, for you to record again if the TVD was what was meant.
        </Para>
      </GuideSection>

      <GuideSection id="log">
        <SectionHeading icon={LineChart}>The strip log and the d-exponent</SectionHeading>
        <Para>
          The Log view draws the well against depth, with depth increasing down the page. Choose the depth window and the vertical
          scale (fit the window, or 1:200, 1:500, 1:1000, 1:2000 as on paper). The tracks, left to right: depth; rate of
          penetration (the imported curve, or the recorded bit depths over drilling time when nothing was imported, and the log
          says which); the lithology column, each description drawn as its percentages in the Suite lithology colours; gas in ppm
          on a logarithmic scale (total gas, C1 to C5, typed and imported together; total gas in uncalibrated units on a track of
          its own); the d-exponent; tops and casing (tops as called are solid lines, the prognosis dashed, casing shoes brown);
          and the descriptions and shows as text at the top of their intervals.
        </Para>
        <Para>
          PDF saves the same log as a document to the chosen scale, page after page down the hole. Every page states the well,
          field, operator and rig, that depths are measured depths below KB with the KB elevation, the interval and the scale,
          who prepared it and the software build. An interval too long for the scale is refused with what to change.
        </Para>
        <SubHeading>d-exponent</SubHeading>
        <Para>
          For every data row with a rate of penetration, a rotary speed and a weight on bit (imported or typed on the Import view)
          the app computes the d-exponent: log(R / 60N) over log(12W / 10^6 D), with R in ft/hr, N in rev/min, W in lbf and D the
          bit size in inches, whatever units the data arrived in. The bit size is taken from the row, or from the open hole section
          in Config at that depth. Record the normal pore pressure gradient of the area, with its unit (ppg, sg, kg/m3, psi/ft or
          kPa/m), and the app also shows the corrected d-exponent: d times the normal gradient over the mud weight in use (the ECD
          where the row has one, otherwise the mud weight in, and it says which).
        </Para>
        <Para>
          Then give the depth interval you judge normally pressured. The normal trend is the straight line through its dc points
          on the logarithmic scale against TVD, drawn dashed down the whole track; rows more than 10 percent below it are marked
          and listed. The settings are a record with your name on it. A row that cannot be computed is counted with the reason.
        </Para>
        <Callout tone="info" title="An indication, with no pressure computed">
          A dc falling below its normal trend is one sign of rising pore pressure, to weigh with gas, cavings and hole condition.
          The app does not turn it into a pore pressure here.
        </Callout>
      </GuideSection>

      <GuideSection id="tops">
        <SectionHeading icon={Tags}>Formation tops</SectionHeading>
        <Para>
          An interpretation says what the evidence suggests: a depth range and a confidence. A decision is the official call at one
          depth with a status ({TOP_STATUSES.join(', ')}). They are separate records; an interpretation may change without changing
          the call. Every change is a new version; earlier versions are never deleted, and History shows the chain with the evidence
          each version cites, so a reviewer months later can walk from the event back to the observations.
        </Para>
        <Para>
          The table shows each call subsea (TVDSS) and how it came in against the prognosis, also subsea: high means shallower than
          prognosed, low means deeper. The approach panel shows the prognosis and the bit subsea beside the offset wells. On a tablet
          held upright or a phone the workstation stacks into one column with a well chooser at the top and the lag panel under the view.
        </Para>
        <Para>
          A first call is preliminary or confirmed; final needs an approver role on the well; a withdrawn call is not current and never
          publishes. The approach panel in the dock shows the next prognosed top ahead of the bit, its uncertainty window, the distance
          in MD and TVD, the offset wells' subsea depths, the current interpretation and call, and recent evidence. It presents; you call.
        </Para>
      </GuideSection>

      <GuideSection id="timeline">
        <SectionHeading icon={ListOrdered}>The timeline</SectionHeading>
        <Para>
          Events: {EVENT_TYPES.map((e) => e.name.toLowerCase()).join(', ')}. A common event starts in one click from Live with the time,
          the user and the bit depth captured; an event with a duration stays open until you end it. The timeline shows them by report
          day, tour or the whole well with the minutes by type.
        </Para>
      </GuideSection>

      <GuideSection id="handover">
        <SectionHeading icon={ClipboardList}>Shift handover</SectionHeading>
        <Para>
          One action generates the handover of the tour that just ended (or the current tour so far) from the record: status, the
          interval drilled, tops called, the current lithology, shows, gas, observations, operations and samples. Those sections cannot
          be edited here; if a fact is wrong, correct its record and the handover regenerates. Show sources lists the records behind
          each line.
        </Para>
        <Para>
          The geological summary, watch items, outstanding items and remarks are yours to write; each is stored as a record of its own
          and a later edit is a new version. Record this version stores the report with the hash of its content; signing records who
          signed which version, with the role, the UTC and rig times and that hash.
        </Para>
      </GuideSection>

      <GuideSection id="report">
        <SectionHeading icon={FileText}>Daily report and sign-off</SectionHeading>
        <Para>
          The daily geological report covers the rig-local report day on the operator's template (paste it in Config; the generic
          template is used otherwise). Every generated value traces to a record; the narrative sections are records. PDF and DOCX
          exports render the same model.
        </Para>
        <Para>
          A sign-off is an authenticated record, made on the device even without a connection. When the record is shared the platform
          countersigns it, and the sign-off block then names the key and the certificate number; the device verifies the
          countersignature against the keys the Suite carries and says so in plain words, including when it cannot.
        </Para>
      </GuideSection>

      <GuideSection id="sharing">
        <SectionHeading icon={RefreshCw}>Sharing and conflicts</SectionHeading>
        <Para>
          Sharing is automatic whenever a link exists: what this device wrote goes up, what the office wrote comes down. Nothing is
          ever overwritten. Observations never conflict (two observations of one thing are two records). Interpretations, decisions and
          tops keep every competing version; the app surfaces them, and an approver records a resolving version that cites both.
        </Para>
        <Para>
          The sharing drawer shows what is waiting, what the server refused and why (for example a final call by someone without an
          approver role), conflicts, storage held on this device and photographs not yet backed up. Share now and Retry refused are there
          for when you want them; routine sharing needs no click.
        </Para>
      </GuideSection>

      <GuideSection id="publish">
        <SectionHeading icon={Upload}>Publishing to the registry</SectionHeading>
        <Para>
          Wellsite Studio writes to the shared registry only through Publish on Tops, by the owner of the registry well and with a
          connection: final official calls become registry tops, current cuttings descriptions become lithology intervals with the
          components in their properties, and the photographs ticked under Photographs to publish become core images. A republish replaces only the rows this app wrote earlier. It never touches a hand-typed row or another app's. When a formation already has a registry top from another source, such as a prognosis typed in Well Data Manager, the publish says that the registry now holds two tops of that name so you can tidy them there. Well Correlation, Petrophysics Studio and Stratigraphy Studio read them from there.
        </Para>
      </GuideSection>

      <GuideSection id="pitfalls">
        <SectionHeading icon={AlertTriangle}>Pitfalls and language</SectionHeading>
        <Para>
          Set the rig offset before the first entry; every tour and report day depends on it. Record every pump rate change and
          shutdown, or the lag time is wrong even though the lag strokes are right. Keep the hole sections current to the bit; the lag
          panel warns when they stop short.
        </Para>
        <Para>
          The app never says a kick was detected, that oil is proven, or that casing should be set. It presents evidence and records
          what a person concluded. Assisted features in later releases will be labelled Suggested and need explicit acceptance.
        </Para>
        <Callout tone="warning" title="Correct at the source">
          A generated fact in a handover or report is never edited in the document. Find its record, correct it (a new observation that
          supersedes the old, or a new version), and the document regenerates.
        </Callout>
      </GuideSection>

      <GuideSection id="glossary">
        <SectionHeading icon={ListChecks}>Glossary</SectionHeading>
        <Table headers={['Term', 'Meaning']} rows={[
          ['Observation', 'Something seen or measured. Immutable; corrected by a superseding observation.'],
          ['Interpretation', 'What observations are believed to mean, with a confidence. Versioned.'],
          ['Event', 'Something that happened in the well or the operation. The timeline.'],
          ['Decision', 'A call or recommendation made by a person, with its basis. Versioned.'],
          ['Lag', 'Pump strokes from the bit to surface for the annular volume above a cut point; time follows the pump log.'],
          ['Overdue', 'Past the predicted arrival by more than the tolerance; for review and never assumed missed.'],
          ['Prognosis', 'The pre-drill tops, offsets, casing points and geometry, as a numbered snapshot with its date.'],
          ['Conflict', 'Two competing versions of one thing; kept until an approver resolves them.'],
          ['Countersignature', 'The platform signature over a sign-off and the hash it attests, verifiable offline.'],
        ]} />
        <Para>Depth entry keys: <Code>Tab</Code> next field, <Code>Ctrl+D</Code> copy previous description, <Code>Ctrl+S</Code> save, <Code>F2</Code> quick or full mode.</Para>
      </GuideSection>
    </HelpGuideShell>
    </div>
  );
}
