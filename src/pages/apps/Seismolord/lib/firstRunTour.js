// First-run tour (discoverability programme, 2026-09-23): the steps, each
// anchored to a [data-tour] element in the workspace, and the per-browser
// "seen" flag. A missing anchor draws its card in the middle of the page,
// so a step never blocks the tour. Copy rule: no em dashes.

export const TOUR_SEEN_KEY = 'seismolord.tour.v1.seen';

export const TOUR_STEPS = [
  {
    anchor: 'explorer',
    title: 'Your data',
    body: 'Volumes, horizons, faults, wells, surfaces and 2D lines. Attribute volumes nest under the volume they came from. Right-click anything for its actions.',
  },
  {
    anchor: 'ribbon-tab-home',
    activate: true,
    title: 'Home',
    body: 'Choose the volume and the line, play through the slices, set the display, and blend an attribute over the seismic in Co-render.',
  },
  {
    anchor: 'ribbon-tab-interpretation',
    activate: true,
    title: 'Interpretation',
    body: 'Pick and track horizons, draw faults, Detect faults automatically, build horizons from well tops with Tops to horizons, and compute attribute volumes such as variance.',
  },
  {
    anchor: 'start-here',
    title: 'Start here',
    body: 'What exists for the open volume, what the upload made, and the next steps with one click each. It stays in the dock on the right.',
  },
  {
    anchor: 'toolbox',
    title: 'Toolbox and copilot',
    body: 'The docked picking tools, and the copilot that asks before it acts.',
  },
  {
    anchor: 'help',
    title: 'Help',
    body: 'The full guide, including what each automatic step does and how to check it.',
  },
];

/** Whether this browser has finished or skipped the tour. */
export function tourSeen(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(storage = globalThis.localStorage) {
  try {
    storage?.setItem(TOUR_SEEN_KEY, '1');
  } catch { /* private mode: the tour shows again next time */ }
}

/**
 * Where the card goes for a target rect: below it when there is room; for
 * a tall target (a panel), beside it on the right when there is room;
 * else above. Always clamped inside the viewport. No rect = centred.
 */
export function placeCard(rect, viewport, card = { w: 320, h: 200 }, gap = 10) {
  const { w: vw, h: vh } = viewport;
  const clampTop = (t) => Math.min(Math.max(8, t), Math.max(8, vh - card.h - 8));
  if (!rect) return { left: Math.max(8, (vw - card.w) / 2), top: Math.max(8, (vh - card.h) / 2) };
  const left = Math.min(Math.max(8, rect.left), Math.max(8, vw - card.w - 8));
  const below = rect.top + rect.height + gap;
  if (below + card.h <= vh - 8) return { left, top: below };
  const right = rect.left + rect.width + gap;
  if (rect.height > card.h && right + card.w <= vw - 8) return { left: right, top: clampTop(rect.top) };
  return { left, top: clampTop(rect.top - card.h - gap) };
}
