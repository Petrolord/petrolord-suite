import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import PetroWorkstation from './components/PetroWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Petrophysics Studio (Geoscience G2): the deep log-analysis
// workstation on the shared well registry — supersedes the five
// shallow petrophysics tiles. Full-viewport workstation (the
// Seismolord/WDM idiom); PetroWorkstation owns all state and this page
// only mounts it on the real geo_wells backend.
// Design system rollout W1C: the page opts in to the Petrolord theme (light
// by default, dark per user through the ribbon toggle). The log tracks,
// crossplots and histograms stay white chart paper (data-canvas="chart").
export default function PetrophysicsStudio() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Petrophysics Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Deep petrophysical log analysis on the shared well registry: Vsh, porosity, Rw, water saturation, cutoffs and net pay, crossplots with facies tagging and Pickett fits, computed curves and zone summaries published back for correlation, mapping and volumetrics."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden" data-testid="petro-theme-scope">
        <PetroWorkstation backend={backend} />
      </div>
    </>
  );
}
