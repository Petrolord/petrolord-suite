// Section names (AppUpgrade WC-U2-001): one rule for the registry service and
// the in-memory harness backend. Names are unique per user ignoring case and
// surrounding spaces, never blank, at most 80 characters.

export const DEFAULT_SECTION_NAME = 'Default section';
export const SECTION_NAME_MAX = 80;

const key = (n) => String(n ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Why a name cannot be used, or null. @param {Array<{id, name}>} existing */
export function sectionNameProblem(name, existing = [], exceptId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Type a name for the section.';
  if (n.length > SECTION_NAME_MAX) return `A section name is at most ${SECTION_NAME_MAX} characters.`;
  const clash = existing.find((s) => s.id !== exceptId && key(s.name) === key(n));
  return clash ? `You already have a section named ${clash.name}.` : null;
}

/** "<name> (copy)", "<name> (copy 2)" ... the first free one. */
export function copyName(name, existing = []) {
  const base = `${String(name ?? '').trim() || DEFAULT_SECTION_NAME} (copy`;
  for (let i = 1; i < 1000; i++) {
    const cand = i === 1 ? `${base})` : `${base} ${i})`;
    if (!sectionNameProblem(cand, existing)) return cand;
  }
  return `${base} ${Date.now()})`;
}

/** base, "base 2", "base 3" ... the first free one. */
export function freeName(base, existing = []) {
  const b = String(base ?? '').trim() || DEFAULT_SECTION_NAME;
  for (let i = 1; i < 1000; i++) {
    const cand = i === 1 ? b : `${b} ${i}`;
    if (!sectionNameProblem(cand, existing)) return cand;
  }
  return `${b} ${Date.now()}`;
}
