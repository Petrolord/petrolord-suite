// Senior test T1 (2026-09-27): the Assurance forms validate on submit and
// show each message beside its field. With the submit buttons at the foot of
// a long form, a message on a field scrolled out of view left the button
// looking dead. After the errors render, the first invalid field (fields are
// id'd by their form key) is scrolled into view and focused.
export function focusFirstError(found, order) {
  const keys = order ? order.filter((k) => found[k]) : Object.keys(found);
  if (!keys.length || typeof document === 'undefined') return;
  const run = () => {
    const el = keys.map((k) => document.getElementById(k)).find(Boolean);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
}
