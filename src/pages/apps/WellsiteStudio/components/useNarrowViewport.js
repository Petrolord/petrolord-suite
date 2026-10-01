// WS-U1-004: true below the width where the three-panel workstation stops
// fitting (a tablet in portrait, a phone). jsdom has no matchMedia: false.
import { useEffect, useState } from 'react';

export const NARROW_PX = 900;

export function useNarrowViewport(maxPx = NARROW_PX) {
  const query = `(max-width: ${maxPx - 1}px)`;
  const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [narrow, setNarrow] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else if (mq.removeListener) mq.removeListener(on); };
  }, [query]);
  return narrow;
}
