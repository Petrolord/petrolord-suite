/**
 * Report Kit: the layout engine. One cursor running down the page, a page
 * break when the next block does not fit, and "keep with next": a block
 * that must not be split from what follows it (a heading and its table, a
 * figure title, its plot and its caption) asks for the height of the whole
 * group before it draws the first part.
 */
import { PAGE } from './theme.js';

/**
 * @param {object} doc jsPDF document
 * @param {{top?: number, bottom?: number, left?: number, right?: number}} [page]
 */
export function createLayout(doc, page = {}) {
  const geo = { ...PAGE, ...page };
  geo.width = geo.right - geo.left;
  let y = geo.top;
  return {
    left: geo.left,
    right: geo.right,
    width: geo.width,
    top: geo.top,
    bottom: geo.bottom,
    get y() { return y; },
    set y(v) { y = v; },
    /** Move the cursor down. */
    advance(mm) { y += mm; return y; },
    /** Height left on this page. */
    room() { return geo.bottom - y; },
    /** Height of an empty page: a group taller than this cannot be kept together. */
    pageHeight() { return geo.bottom - geo.top; },
    /** Start a new page when `height` does not fit under the cursor. True when it broke. */
    ensure(height) {
      if (y + height > geo.bottom) { doc.addPage(); y = geo.top; return true; }
      return false;
    },
    /** Keep a group together: break first unless the sum of its heights fits. */
    keepTogether(...heights) {
      return this.ensure(heights.reduce((sum, h) => sum + (Number.isFinite(h) ? h : 0), 0));
    },
    /** Start a new page now. */
    newPage() { doc.addPage(); y = geo.top; },
  };
}
