import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import PPWorkstation from './components/PPWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Pore Pressure Studio (Geoscience, G7 follow-on): oracle-validated
// Eaton / Bowers pore-pressure and fracture-gradient prognosis on the
// shared well registry, with Seismolord velocity models as trend-grade
// input and PP/FP/OBG publish-back to geo_wells_logs. Full-viewport
// workstation (the Seismolord/WDM idiom); PPWorkstation owns all state
// and this page only mounts it on the real backend.
export default function PorePressureStudio() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Pore Pressure Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Pore-pressure and fracture-gradient prognosis on the shared well registry: Eaton and Bowers methods with normal-compaction-trend fitting, density or Gardner overburden, Seismolord velocity-model trends, and publishable PP/FP/OBG curves."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <PPWorkstation backend={backend} />
      </div>
    </>
  );
}
