import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import CorrelationWorkstation from './components/CorrelationWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Well Correlation (Geoscience G3): multi-well stratigraphic
// cross-sections on the shared well registry — order wells along a
// path, flatten on any top, pick / drag / propagate formation tops
// (the shared geo_wells_tops rows, so edits reach Seismolord and
// Mapping), fill zones between correlated tops. Full-viewport
// workstation (the WDM/Petrophysics idiom); this page only mounts the
// controller on the real registry backend.
export default function WellCorrelation() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Well Correlation - Petrolord Suite</title>
        <meta
          name="description"
          content="Multi-well stratigraphic correlation on the shared well registry: cross-sections along a picked well path, datum flattening on any top, formation-top picking, drag-editing and propagation, and zone fills — tops written back to the registry for Seismolord and Mapping."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <CorrelationWorkstation backend={backend} />
      </div>
    </>
  );
}
