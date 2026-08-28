// Opening a studio already pointed at a well (Production P9).
//
// The Artificial Lift Advisor compares methods on one well and then
// hands you off to the studio that designs the winner properly. That
// handoff is worth nothing if it drops the well on the way, so the
// advisor puts the field and well ids in the URL and every lift studio
// reads them here.
//
// It runs ONCE, on mount, and only when the studio is not already
// linked. A deep link is an opening move, not a standing instruction:
// re-applying it would fight the user the moment they picked a
// different well.
//
// It reads the query string directly rather than through the router's
// useSearchParams, deliberately. The parameter is read once and never
// reacted to, so router reactivity buys nothing -- and taking it would
// mean every lift studio's PROVIDER could no longer be mounted outside
// a Router, which is a real cost for no gain.
import { useEffect, useMemo, useRef } from 'react';

/**
 * @param {object}   args
 * @param {object}   args.link        the studio's current link section
 * @param {Function} args.patchSection (section, patch) => void
 * @param {Array}    args.spineWells  wells for the linked field, once loaded
 */
export const useWellDeepLink = ({ link, patchSection, spineWells }) => {
  const applied = useRef(false);
  const named = useRef(false);

  const { fieldId, wellId } = useMemo(() => {
    if (typeof window === 'undefined') return { fieldId: null, wellId: null };
    const params = new URLSearchParams(window.location.search || '');
    return { fieldId: params.get('field'), wellId: params.get('well') };
  }, []);

  useEffect(() => {
    if (applied.current) return;
    if (!fieldId) return;
    applied.current = true;
    // Never overwrite a link the user already has.
    if (link?.fieldId) return;
    patchSection('link', { fieldId, wellId: wellId || null, wellName: '' });
  }, [fieldId, wellId, link, patchSection]);

  // The name only arrives with the wells, which load after the field is
  // set, so it is filled in on the next pass rather than guessed at.
  useEffect(() => {
    if (named.current) return;
    if (!wellId || !spineWells?.length) return;
    const well = spineWells.find((w) => w.id === wellId);
    if (!well) return;
    named.current = true;
    patchSection('link', { wellName: well.name });
  }, [wellId, spineWells, patchSection]);
};
