/**
 * AS13 — who a form is talking about.
 *
 * The three independence rules in these apps (the ISO 19011 auditor,
 * the audit lead who may not be the auditee, the lesson author who may
 * not validate) are stated in the engine on user ids. Until AS13 the
 * forms set only typed names, so the ids were never there and the
 * rules never fired from the interface.
 *
 * Two things fix that. The forms now pick Suite members, which sets
 * the id. And where a person is only typed (somebody without a Suite
 * account), two typed names that are the same name are treated as the
 * same person, because that is what the reader of the record will
 * take them to be. This is presentation-side matching of the form's
 * own inputs; the rule itself stays the engine's.
 */

/** Case, surrounding space and doubled spaces do not make a different person. */
export const normaliseName = (value) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const sameNamedPerson = (a, b) => {
  const x = normaliseName(a);
  return Boolean(x) && x === normaliseName(b);
};

/**
 * Are these two people the same person, as far as the record can tell?
 *
 * Two ids decide it. Otherwise the names do: a member picked on one side
 * carries their name, so a typed name that matches it is caught too.
 */
export const isSamePerson = (aId, aName, bId, bName) => {
  if (aId && bId) return aId === bId;
  return sameNamedPerson(aName, bName);
};

/**
 * A stand-in id for a typed name, used only to hand the engine's own
 * independence check two equal ids when two typed names match, so the
 * refusal the user reads is the engine's sentence, word for word.
 * It is never written to the database.
 */
export const nameKey = (name) => `name:${normaliseName(name)}`;

/** The display name for a member row. */
export const memberName = (member) =>
  (member ? String(member.full_name || member.email || '').trim() : '') || null;
