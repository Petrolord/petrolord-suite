import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import PPWorkstation from './components/PPWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Pore Pressure Studio (Geoscience, G7 follow-on): oracle-validated
// Eaton / Bowers pore-pressure and fracture-gradient prognosis on the
// shared well registry, with Seismolord velocity models as trend-grade
// input and PP/FP/OBG publish-back to geo_wells_logs. Full-viewport
// workstation (the Seismolord/WDM idiom); PPWorkstation owns all state
// and this page only mounts it on the real backend.
// Design system rollout W4B: the page opts in to the Petrolord theme (light
// by default, dark per user through the ribbon toggle).
export default function PorePressureStudio() {
  // U2-010: ?example=1 opens the worked example on an in-memory backend (loaded on demand)
  const [search] = useSearchParams();
  const example = search.get('example') === '1';
  const registry = useMemo(() => (example ? null : makeRegistryBackend()), [example]);
  const [exampleBackend, setExampleBackend] = useState(null);
  useEffect(() => {
    if (!example) return undefined;
    let live = true;
    import('./services/workedExample').then((m) => { if (live) setExampleBackend(m.makeWorkedExampleBackend()); });
    return () => { live = false; };
  }, [example]);
  const backend = example ? exampleBackend : registry;
  return (
    <>
      <Helmet>
        <title>Pore Pressure Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Pore-pressure and fracture-gradient prognosis on the shared well registry: Eaton and Bowers methods with normal-compaction-trend fitting, density or Gardner overburden, Seismolord velocity-model trends, and publishable PP/FP/OBG curves."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden" data-testid="pp-theme-scope">
        {backend && <PPWorkstation key={example ? 'example' : 'registry'} backend={backend} />}
      </div>
    </>
  );
}
