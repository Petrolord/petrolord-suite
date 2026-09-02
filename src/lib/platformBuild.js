// Platform build stamp (Project Portability PP0, PLAN §4.4).
//
// vite.config.js injects __PLATFORM_BUILD__ at build time from
// package.json + git (or build-info.json when the build has no .git,
// which is the Hostinger case). Under jest there is no define, so the
// typeof guard yields the dev fallback. Every saved row and every
// package manifest carries PLATFORM_BUILD.sha; compatibility itself is
// decided on schema versions (src/lib/stateVersion.js), the build is
// for diagnosis.

/* global __PLATFORM_BUILD__ */

const FALLBACK = { version: 'dev', sha: 'unknown', builtAt: null, source: 'none' };

export const PLATFORM_BUILD = Object.freeze(
  typeof __PLATFORM_BUILD__ !== 'undefined' && __PLATFORM_BUILD__
    ? { ...FALLBACK, ...__PLATFORM_BUILD__ }
    : FALLBACK,
);

/** Short human label, e.g. "Petrolord Suite 4.0.0 (65c6e6242)". */
export function buildLabel() {
  const { version, sha } = PLATFORM_BUILD;
  return sha && sha !== 'unknown' ? `Petrolord Suite ${version} (${sha})` : `Petrolord Suite ${version}`;
}
