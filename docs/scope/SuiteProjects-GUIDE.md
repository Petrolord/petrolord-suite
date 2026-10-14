# Clients and projects: user guide

For consultants and teams who keep several companies' data in one Petrolord
organisation. Design and status: `docs/scope/SuiteProject-DESIGN.md`.

## The idea

Organisation > Client (company) > Project. Every well, top, log, surface,
culture layer, correlation section, stratigraphic column and seismic volume
or line belongs to one project. Each Geoscience app shows the current
project only.

## First steps (pilot walk-through)

1. Open **Projects** at the bottom of the dashboard sidebar.
2. Under **Clients**, add each company you work for (name, optional colour,
   logo link and notes).
3. Under **Projects**, create a project and choose its client, for example
   "Breeze Energy" and "OML 42 field study". Add as many projects per client
   as you need. A project without a client is listed under Internal.
4. From then on every app ribbon shows the switcher next to the Geoscience
   home link: **Client › Project**. Choose a project and the app reloads with
   that project's data.
5. Load data as usual. Well Data Manager LAS imports, Seismolord imports and
   project packages (.pld) land in the current project.
6. To separate what you loaded before projects existed, go to **Move to
   project** on the Projects page: choose Default as the source, the kind of
   data, tick the items, choose the client project, and move. Logs and tops
   follow their well; horizons and faults follow their volume.

## Who sees what

- Before you create anything, nothing changes: one Default project, no
  switcher, the same lists.
- A project is open to your organisation by default. Records stay private or
  shared one by one, as before.
- **Members only** limits a project's data to its members (you, as owner, are
  one). Organisation admins can still open it; each opening is logged and the
  owner can see that log.
- Another organisation never sees your clients or projects.

## Project settings

On the Projects page, the owner of a project (or an organisation admin) sets:

- **Units**: follow the organisation default, or set units for this project.
  Anyone who chose their own units keeps them.
- **Coordinate reference system** (client projects): the system imports
  convert into. Set it before loading data; once the project holds data in
  it, change it with Seismolord's reproject flow.
- **Datum**: the depth reference for new wells (KB, RT, DF, GL...), the
  vertical datum and the seismic reference datum for new pore pressure models.
- **Geologic timescale**: stay on an earlier ICS chart edition for this
  project's stratigraphy.

A settings change applies from then on. Data already stored never changes.

## Members and roles

On the Projects page the owner (or an organisation admin) adds colleagues to
a project and gives each a role:

- **Owner** manages the project, its members and settings.
- **Editor** adds and changes data.
- **Viewer** reads a members-only project's data and changes nothing.

In a project open to your organisation every colleague already reads it;
members matter once you make it members only. The project log shows who
added or removed whom, every role change, and every time an organisation
admin opened a members-only project.

## Copy between projects

Under **Move or copy to project**, tick wells, surfaces or culture layers and
choose **Copy**. The copies are complete (logs, tops and grids included),
record where they came from, and leave the originals in place. A name the
target project already uses gets "(imported)" added. Seismic is moved, not
copied.

Well names are unique within a project, so the same name can exist in two
clients' projects.

## Packages and backups

- **Export package** (Well Data Manager) packs the current project's data.
- **Import package** puts everything into the current project.
- **Backup** on the Data Export page covers all your projects.

## Archive

Archive a project or a client when the work ends. It leaves the switcher;
nothing is deleted. Restore it from the Projects page.

## Not yet project-aware (planned)

Each app's own saved sessions (for example a saved Petrophysics project or a
Material Balance case) are not yet filed by project; they follow in phase P4.

