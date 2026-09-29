// The saved-section state kind (PP0, docs/scope/ProjectPortability-PLAN.md
// section 4.3), shared by the registry service (src/lib/sectionsRegistry.js)
// and the in-memory harness backends, so both open a stored
// geo_correlation_sections row the same way: a row stamped by a newer build
// is refused with the reload sentence (AppUpgrade WC-U1, PL5).
//
// Version 1 is the current row shape; a future shape change bumps `current`
// and adds migrations[n].

import { registerStateKind, openStateRow } from '@/lib/stateVersion';

export const CORRELATION_SECTION_KIND = 'correlation-section';
registerStateKind(CORRELATION_SECTION_KIND, { current: 1, label: 'correlation section' });

/** A stored section row as the current version (null in, null out). */
export const openSectionRow = (row) => openStateRow(CORRELATION_SECTION_KIND, row);
