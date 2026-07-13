import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import MappingWorkstation from './components/MappingWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Mapping & Surface Studio (Geoscience G4): gridding, contouring and
// surface math on the shared well + surface registries. Grid well
// tops / zone attributes / imported horizons into surfaces, contour
// and edit them, do isochores, and publish to geo_surfaces for
// ReservoirCalc Pro and others. Full-viewport workstation (the
// WDM/Petrophysics/Correlation idiom); this page mounts the controller
// on the real registry backend.
export default function MappingSurfaceStudio() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Mapping &amp; Surface Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Gridding and contouring on the shared subsurface registry: map well tops and zone attributes, import Seismolord horizons, do surface math (isochores), and publish surfaces to the registry for volumetrics — no filesystem round-trip."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <MappingWorkstation backend={backend} />
      </div>
    </>
  );
}
