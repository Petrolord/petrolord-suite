// QI Studio: the Project Data Inventory tab (owner request 2026-10-11). The
// shared inventory (components/projectInventory) over this study: the
// study's wells as already loaded on Setup (every registry well when none
// is chosen yet), the study's volumes and their derived products, its
// target zones as the default interval, and the stacking velocities its
// prestack runs hold. What the user records is saved in the project
// payload (dataInventory), so no table and no migration.
//
// A tab of its own, last in the row, so the tabs the recorded videos and
// lessons open (Setup to Report, including the existing Data inventory
// register) render exactly as before.
import React, { useMemo } from 'react';
import ProjectDataInventory from '@/components/projectInventory/ProjectDataInventory';
import { sourceFromBackend } from '@/lib/projectInventory/backendSource';
import { makeRegistryInventorySource } from '@/lib/projectInventory/registrySource';
import { useAppUnits } from '@/lib/units/useAppUnits';
import { useQIStudio } from '../QIStudioContext';

const REGISTRY = makeRegistryInventorySource();

export default function ProjectInventoryTab() {
  const {
    project, ready, loading, backend, setDataInventory, canWrite, projectName, currentProjectId,
  } = useQIStudio();
  const units = useAppUnits('qi-inventory', { depth: { family: 'depth', allowed: ['m', 'ft'] } }, { fallback: { depth: 'ft' } });
  const volumeIds = project.volumeIds;
  const volumeKey = volumeIds.join(',');
  const source = useMemo(() => sourceFromBackend(backend, {
    seismic: backend.inventorySeismic ? () => backend.inventorySeismic() : () => REGISTRY.loadSeismic({ volumeIds }),
  }), [backend, volumeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = project.wellIds.length > 0;
  // the study's wells once Setup has loaded them all
  const wellsOverride = useMemo(() => (chosen && !loading ? ready : null), [chosen, loading, ready]);
  const defaultInterval = useMemo(() => (project.targets.length ? { mode: 'zones', names: project.targets } : { mode: 'well' }), [project.targets]);
  const extras = useMemo(() => {
    const velocity = Object.values(project.prestack || {})
      .filter((r) => r && r.velocity && (typeof r.velocity === 'string' ? r.velocity.trim() : true))
      .map((r) => ({ name: `RMS velocity for ${r.name || 'a gather store'}`, source: 'QI Studio prestack' }));
    return { velocity };
  }, [project.prestack]);
  if (chosen && loading) {
    return <section className="rounded-lg border border-pl-border bg-pl-surface p-4 text-xs text-pl-muted" data-testid="qi-pdi-loading">Loading the study wells</section>;
  }
  return (
    <div data-testid="qi-pdi">
      <ProjectDataInventory
        source={source}
        reloadKey={`${project.wellIds.join(',')}|${volumeKey}`}
        wellsOverride={wellsOverride}
        state={project.dataInventory}
        onStateChange={setDataInventory}
        canWrite={canWrite}
        audience="qi"
        unit={units.units.depth}
        projectName={projectName || 'QI study'}
        appLabel="QI Studio"
        defaultInterval={defaultInterval}
        extras={extras}
        saveHint={currentProjectId
          ? 'Built from the registries each time it opens. What you set by hand is saved with this QI project.'
          : 'Built from the registries. Create or open a project to keep what you set by hand.'}
      />
    </div>
  );
}
