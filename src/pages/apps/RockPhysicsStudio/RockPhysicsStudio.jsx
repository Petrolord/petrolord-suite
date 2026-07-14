import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import RockWorkstation from './components/RockWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Rock Physics Studio (Geoscience G6): the quantitative-interpretation
// workstation on the shared well registry — Batzle-Wang fluids,
// Gassmann fluid substitution, exact-Zoeppritz AVO with
// intercept-gradient classification, and wedge/tuning synthetics.
// Full-viewport workstation (the Seismolord/WDM idiom);
// RockWorkstation owns all state and this page only mounts it on the
// real geo_wells backend.
export default function RockPhysicsStudio() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Rock Physics Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Quantitative interpretation on the shared well registry: Batzle-Wang pore fluids, Gassmann fluid substitution, exact Zoeppritz AVO with intercept-gradient crossplots and Rutherford-Williams classes, and wedge synthetics with tuning analysis."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <RockWorkstation backend={backend} />
      </div>
    </>
  );
}
