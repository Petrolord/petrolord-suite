import React from 'react';
import { Article, H2, H3, P, UL, OL, Note, Table } from './DocParts';

// The shared-registry chapter (RC1 to RC3, 2026-09-06). Every control
// named here exists in the app. Copy rule: no em dashes.
const RegistryGuide = () => (
  <Article
    title="The Shared Registry"
    lead="ReservoirCalc Pro reads the wells, zone averages, surfaces and polygons the other Geoscience apps leave in the shared registry, and hands its surfaces back to Mapping and Earth Modeling. This article covers the Wells tab, what each pull sets, the depth convention, and the launchers."
  >
    <H2>The Wells tab</H2>
    <P>
      The Wells tab (between Surf and the AOI icon) is the door from the registry into the volumetric inputs.
      Nothing it offers is applied until you press Apply, and every pull is written to the audit trail with its
      source.
    </P>
    <Table
      headers={['Control', 'What it sets', 'Source']}
      rows={[
        ['Petrophysics from a registry zone', 'Porosity, water saturation, net to gross and net thickness (converted to the unit system) averaged across the wells that carry the zone', 'Zone averages published by Petrophysics Studio (Zones, Publish)'],
        ['Area from a registry surface', 'Area, from the live footprint of the surface in the unit system', 'Surfaces published by Mapping & Surface Studio, Earth Modeling or Seismolord'],
        ['Boundary polygon as an AOI', 'A new AOI with the polygon as drawn; activate it in the AOI tab to clip the structural volumetrics', 'Boundary and licence polygons drawn in Mapping & Surface Studio'],
      ]}
    />
    <Note tone="info" title="Only published averages count">
      A zone shows how many of its wells carry a publish. A zone with no publish cannot be applied; publish the zone
      summaries in Petrophysics Studio first. Manual values you typed survive: a field without a registry source is
      left as it was.
    </Note>
    <P>
      The wells behind a zone are listed with a link into Well Data Manager, and the panel remembers where the
      applied values came from (shown under the controls and saved with the project).
    </P>

    <H2>Depth convention and the contact unit</H2>
    <P>
      Every depth surface in the registry is an elevation: negative below the datum (TVDSS), in metres or feet as
      its row records. Fluid contacts follow the same convention. The unit selector on the Fluid Contacts card
      (ft or m) defaults to your Geoscience depth unit, the same setting Mapping and Earth Modeling use, and is
      remembered with the project; the value stored for the engine stays in the unit system's length unit, so
      toggling Field and Metric converts it as before.
    </P>
    <P>
      The map and 3D viewers label depth with the surface's own unit. A metre grid imported into a field
      workspace therefore reads Depth (m); the engine converts through the surface's recorded units, so the
      volumes are the same either way.
    </P>

    <H2>Launchers</H2>
    <UL>
      <li>A surface that came from the registry carries Open in Mapping and Open in Earth Modeling on its card in the Surf tab.</li>
      <li>The wells listed under a registry zone open in Well Data Manager on their tops tab.</li>
      <li>Mapping and Earth Modeling open ReservoirCalc Pro on a published surface: the Surf tab opens with the Surface import on that row.</li>
    </UL>

    <H2>Verifying the numbers</H2>
    <OL>
      <li>Apply the zone averages, then compare the Petrophysics fields with the zone summary table in Petrophysics Studio.</li>
      <li>Apply the footprint area, then compare with the surface's live node count times its cell area in Mapping.</li>
      <li>Add the boundary as an AOI, activate it, and check the clipped area against the polygon's area in Mapping's culture list.</li>
    </OL>
    <H3>When something is missing</H3>
    <P>
      No wells listed: the account has no wells in the registry, or they are shared with another organization. No
      surfaces: nothing has been published yet; Mapping's Publish surface and Earth Modeling's Publish layer put
      rows here. No boundaries: draw one in Mapping's Polygons section (boundary) or import a licence block as a
      culture layer.
    </P>
  </Article>
);

export default RegistryGuide;
