import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import EarthWorkstation from './components/EarthWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Earth Modeling (Geoscience G8): the consolidation workstation on the
// shared registries — structural surfaces from Mapping & Surface
// Studio stacked into a layer-cake framework, zones from correlated
// tops, per-zone property population from Petrophysics Studio zone
// averages (constant / trend / simple kriging per fault block), zone
// volumes, and GRV-ready publishes back to geo_surfaces for
// ReservoirCalc Pro. Full-viewport workstation; EarthWorkstation owns
// all state and this page only mounts it on the real backend.
export default function EarthModeling() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Earth Modeling - Petrolord Suite</title>
        <meta
          name="description"
          content="Layer-cake earth modeling on the shared subsurface registry: structural frameworks from mapped surfaces, fault-block zonation, per-zone property population from petrophysics, zone volumes, and surface export to volumetrics."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <EarthWorkstation backend={backend} />
      </div>
    </>
  );
}
