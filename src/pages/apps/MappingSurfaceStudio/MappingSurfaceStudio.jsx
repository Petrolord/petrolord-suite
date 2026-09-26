import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import MappingWorkstation from './components/MappingWorkstation';
import { makeRegistryBackend } from './services/registryBackend';
import { makeInMemoryBackend } from './services/inMemoryBackend';

// Mapping & Surface Studio (Geoscience G4): gridding, contouring and
// surface math on the shared well + surface registries. Grid well
// tops / zone attributes / imported horizons into surfaces, contour
// and edit them, do isochores, and publish to geo_surfaces for
// ReservoirCalc Pro and others. Full-viewport workstation (the
// WDM/Petrophysics/Correlation idiom); this page mounts the controller
// on the real registry backend.
export default function MappingSurfaceStudio() {
  // T1 (E4): ?sample=1 opens the studio on built-in sample wells and
  // surfaces held in memory, so a first visit can see a real map in one
  // click; nothing is read from or written to the registry
  const [params] = useSearchParams();
  const sample = params.get('sample') === '1';
  const backend = useMemo(() => (sample ? makeInMemoryBackend() : makeRegistryBackend()), [sample]);
  return (
    <>
      <Helmet>
        <title>Mapping &amp; Surface Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Gridding and contouring on the shared subsurface registry: map well tops and zone attributes, import Seismolord horizons, do surface math (isochores), and publish surfaces to the registry for volumetrics — no filesystem round-trip."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden flex flex-col">
        {sample && (
          <div className="px-3 py-1 text-[11px] bg-amber-500/15 text-amber-200 border-b border-amber-700/40 flex items-center gap-2" data-testid="map-sample-banner">
            Sample data: five wells and two surfaces held in this tab. Nothing is saved to your registry.
            <Link to="?" className="ml-auto underline">Back to my data</Link>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <MappingWorkstation backend={backend} sample={sample} />
        </div>
      </div>
    </>
  );
}
