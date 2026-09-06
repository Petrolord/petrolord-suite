// Describe-screen helpers (WS1): parse what the geologist types into
// vocabulary codes per attribute, render a code back into the profile
// term for the field, and shape the description record. Pure.

import { ATTRIBUTES, resolveTerm, resolveColour, validateDescription, emptyComponent, copyPrevious, diffDescriptions } from '@/lib/wellsite/descriptionVocabulary';
import { term, abbreviate, narrative, mergeProfile, PETROLORD_PROFILE } from '@/lib/wellsite/abbreviations';

export { ATTRIBUTES, validateDescription, emptyComponent, copyPrevious, diffDescriptions, abbreviate, narrative, mergeProfile, PETROLORD_PROFILE };

export const DESCRIPTION_SUBTYPE = 'cuttings_description';

const attr = (key) => ATTRIBUTES.find((a) => a.key === key);

/** Parse typed text for an attribute. Returns {ok, value} or {ok:false, error}. Empty text clears. */
export function parseField(key, text) {
  const a = attr(key);
  const t = String(text ?? '').trim();
  if (!t) return { ok: true, value: a.multi ? [] : null };
  if (key === 'percent') {
    const n = Number(t.replace('%', ''));
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Percent must be a number.' };
  }
  if (key === 'colour') {
    const c = resolveColour(t);
    return c ? { ok: true, value: c } : { ok: false, error: `Colour ${t} is not in the vocabulary.` };
  }
  if (a.range || key === 'rounding') {
    const parts = t.split(/\s*(?:-|to)\s*/).filter(Boolean);
    const from = resolveTerm(a.table, parts[0]);
    if (!from) return { ok: false, error: `${a.label} ${parts[0]} is not in the vocabulary.` };
    if (parts.length > 1) {
      const to = resolveTerm(a.table, parts[1]);
      if (!to) return { ok: false, error: `${a.label} ${parts[1]} is not in the vocabulary.` };
      return { ok: true, value: { from: from.code, to: to.code } };
    }
    return { ok: true, value: a.range ? { from: from.code, to: null } : from.code };
  }
  if (a.multi) {
    const out = [];
    for (const piece of t.split(/\s*[,;]\s*/).filter(Boolean)) {
      if (a.amount) {
        const words = piece.split(/\s+/);
        const amount = words.length > 1 ? resolveTerm('amount', words[0]) : null;
        const rest = amount ? words.slice(1).join(' ') : piece;
        const r = resolveTerm(a.table, rest);
        if (!r) return { ok: false, error: `${a.label} ${piece} is not in the vocabulary.` };
        out.push(amount ? { code: r.code, amount: amount.code } : r.code);
      } else {
        const r = resolveTerm(a.table, piece);
        if (!r) return { ok: false, error: `${a.label} ${piece} is not in the vocabulary.` };
        out.push(r.code);
      }
    }
    return { ok: true, value: out };
  }
  const r = resolveTerm(a.table, t);
  return r ? { ok: true, value: r.code } : { ok: false, error: `${a.label} ${t} is not in the vocabulary.` };
}

const codeOf = (v) => (typeof v === 'string' ? v : v && v.code);

/** Render a stored value back to the text the field shows (profile terms). */
export function fieldText(key, value, profile = PETROLORD_PROFILE) {
  const a = attr(key);
  if (value == null || (Array.isArray(value) && !value.length)) return '';
  const label = (table, code) => term(profile, table, code).label;
  if (key === 'percent') return String(value);
  if (key === 'colour') return [value.modifier ? label('colourModifier', value.modifier) : null, label('colourHue', value.hue)].filter(Boolean).join(' ');
  if (a.range || (key === 'rounding' && typeof value === 'object')) return value.to ? `${label(a.table, value.from)}-${label(a.table, value.to)}` : label(a.table, value.from);
  if (a.multi) return value.map((v) => [v && v.amount ? label('amount', v.amount) : null, label(a.table, codeOf(v))].filter(Boolean).join(' ')).join(', ');
  return label(a.table, value);
}

export function percentSum(components) {
  return (components || []).reduce((s, c) => s + (Number.isFinite(c.percent) ? c.percent : 0), 0);
}

/** The record payload from the editor state. */
export function descriptionPayload({ components, comment, mode, copiedFrom, changedFields, profileId }) {
  return { components, comment: comment || '', mode, copiedFrom: copiedFrom || null, changedFields: changedFields || [], profile_id: profileId || PETROLORD_PROFILE.id };
}

/** A description object (engine shape) from a stored record. */
export function descriptionOf(record) {
  return { id: record.id, mdTopM: record.md_calc_m, mdBaseM: record.md2_calc_m, ...record.payload };
}
