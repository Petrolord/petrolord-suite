import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import EarthWorkstation from './components/EarthWorkstation';
import { makeRegistryBackend } from './services/registryBackend';
import { makeInMemoryBackend } from './services/inMemoryBackend';

// Earth Modeling (Geoscience G8): the consolidation workstation on the
// shared registries — structural surfaces from Mapping & Surface
// Studio stacked into a layer-cake framework, zones from correlated
// tops, per-zone property population from Petrophysics Studio zone
// averages (constant / trend / simple kriging per fault block), zone
// volumes, and GRV-ready publishes back to geo_surfaces for
// ReservoirCalc Pro. Full-viewport workstation; EarthWorkstation owns
// all state and this page only mounts it on the real backend.
export default function EarthModeling() {
  // T1 (EM-T1-E3): ?sample=1 opens on the built-in sample surfaces and
  // wells held in memory; nothing is read from or written to the registry
  const [params] = useSearchParams();
  const sample = params.get('sample') === '1';
  const backend = useMemo(() => (sample ? makeInMemoryBackend() : makeRegistryBackend()), [sample]);
  return (
    <>
      <Helmet>
        <title>Earth Modeling - Petrolord Suite</title>
        <meta
          name="description"
          content="Layer-cake earth modeling on the shared subsurface registry: structural frameworks from mapped surfaces, fault-block zonation, per-zone property population from petrophysics, zone volumes, and surface export to volumetrics."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden flex flex-col">
        {sample && (
          <div className="px-3 py-1 text-[11px] bg-amber-500/15 text-amber-200 border-b border-amber-700/40 flex items-center gap-2" data-testid="em-sample-banner">
            Sample data: three surfaces and four wells held in this tab. Nothing is saved to your registry.
            <Link to="?" className="ml-auto underline">Back to my data</Link>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <EarthWorkstation backend={backend} sample={sample} />
        </div>
      </div>
    </>
  );
}
