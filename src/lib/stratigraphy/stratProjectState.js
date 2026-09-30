// The strat_projects state kind (ST2 view state), shared by the registry
// service (src/lib/stratRegistry.js) and the harness backend, so both open a
// stored row the same way: a row stamped by a newer build is refused with
// the reload sentence (AppUpgrade STRAT-U1, PL5; the sectionState pattern).

import { registerStateKind, openStateRow } from '@/lib/stateVersion';

export const STRAT_PROJECT_KIND = 'strat-project';
registerStateKind(STRAT_PROJECT_KIND, { current: 1, label: 'stratigraphy project' });

/** A stored strat_projects row as the current version (null in, null out). */
export const openStratProjectRow = (row) => openStateRow(STRAT_PROJECT_KIND, row);
