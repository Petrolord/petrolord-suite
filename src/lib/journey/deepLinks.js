// Guided Journey deep links (design 6.3): the guide's buttons open the right
// dialog, not only the page. A page reads its own parameter once and clears it
// from the address (so Back and refresh do not reopen the dialog).
import { useEffect } from 'react';

/** True once when the address carries `key` (= `value` when given); the parameter is then removed. */
export function takeDeepLink(key, value = null) {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  const v = q.get(key);
  if (v == null || (value != null && v !== value)) return false;
  q.delete(key);
  const rest = q.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  return true;
}

/** Run `fn` once on mount when the address carries the deep link. */
export function useDeepLinkAction(key, value, fn) {
  useEffect(() => {
    if (takeDeepLink(key, value)) fn();
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
