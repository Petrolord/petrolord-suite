import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import WellWorkstation from './components/WellWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Well Data Manager (Geoscience G1): the shared subsurface well
// registry — headers, deviation surveys, LAS logs, tops, checkshots —
// consumed by Seismolord and every later geoscience app. Renders as a
// full-viewport workstation (the Seismolord idiom): WellWorkstation is
// the controller and owns all state; this page only mounts it on the
// real geo_wells backend. The dashboard chrome hides its sidebar on
// /apps/ routes, so h-screen fills the browser window exactly.
export default function WellDataManager() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Well Data Manager - Petrolord Suite</title>
        <meta
          name="description"
          content="Shared subsurface well registry: well headers, deviation surveys, LAS log import with SI unit handling, formation tops, checkshots — private by default, shareable with your organization."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <WellWorkstation backend={backend} />
      </div>
    </>
  );
}
