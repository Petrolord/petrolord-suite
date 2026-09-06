import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import StratWorkstation from './components/StratWorkstation';
import { makeRegistryBackend } from './services/registryBackend';

// Stratigraphy Studio (Geoscience G9, ST0): the stratigraphic framework
// on the shared well registry. Stratigraphic column (group, formation,
// member, bed with ages and colours), typed sequence-stratigraphic
// surfaces on the shared tops (Catuneanu stored, Exxon as a display
// option), glossary. Full-viewport workstation; this page only mounts
// the controller on the real registry backend.
export default function StratigraphyStudio() {
  const backend = useMemo(() => makeRegistryBackend(), []);
  return (
    <>
      <Helmet>
        <title>Stratigraphy Studio - Petrolord Suite</title>
        <meta
          name="description"
          content="Stratigraphic framework on the shared well registry: a stratigraphic column with ages and colours, typed sequence-stratigraphic surfaces on the shared tops (Catuneanu, with Exxon terminology as a display option), and a glossary. Types written here draw in Well Correlation, Petrophysics Studio and Well Data Manager at once."
        />
      </Helmet>
      <div className="h-screen w-full overflow-hidden">
        <StratWorkstation backend={backend} />
      </div>
    </>
  );
}
