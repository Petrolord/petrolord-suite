// What a storyboard step can do on screen. Every action moves the visible
// cursor first and only then acts, at a human pace, and waits on the app's
// own state (testids) rather than fixed sleeps.
export function makeDirector(page) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const loc = (t) => (typeof t === 'string' ? page.getByTestId(t) : t);
  // The app can re-render an element between the wait and the measurement
  // ("not attached to the DOM"); look it up again rather than fail the take.
  async function box(target) {
    for (let attempt = 0; ; attempt++) {
      try {
        const l = loc(target).first();
        await l.waitFor({ state: 'visible', timeout: 30000 });
        await l.scrollIntoViewIfNeeded();
        const b = await l.boundingBox();
        if (b) return b;
        throw new Error('no bounding box');
      } catch (e) {
        if (attempt >= 3 || !/not attached|no bounding box|detached/i.test(e.message)) throw e;
        await sleep(400);
      }
    }
  }
  // Chrome shows a link's URL in a status bubble while the real pointer
  // hovers it, which put the recording host on screen. Over a link only the
  // drawn cursor moves, and the click is dispatched to the element.
  const isLink = async (target) => {
    if (!target || typeof target.x === 'number') return false;
    return loc(target).first().evaluate((el) => !!el.closest('a[href]')).catch(() => false);
  };
  async function moveTo(target, { ms = 750, dx = 0.5, dy = 0.5 } = {}) {
    let x; let y;
    if (target && typeof target.x === 'number' && typeof target.width !== 'number') ({ x, y } = target);
    else { const b = await box(target); x = b.x + b.width * dx; y = b.y + b.height * dy; }
    const link = await isLink(target);
    await Promise.all([
      page.evaluate(([a, b, c]) => window.__demo.moveTo(a, b, c), [x, y, ms]),
      link ? Promise.resolve() : page.mouse.move(x, y, { steps: Math.max(4, Math.round(ms / 40)) }),
    ]);
    return { x, y, link };
  }
  const d = {
    page, sleep, loc,
    moveTo,
    async click(target, opts = {}) {
      const p = await moveTo(target, opts);
      await sleep(opts.settle ?? 180);
      await page.evaluate(([x, y]) => window.__demo.ripple(x, y), [p.x, p.y]);
      if (p.link) await loc(target).first().evaluate((el) => el.closest('a[href]').click());
      else await loc(target).first().click({ timeout: 30000 });
      await sleep(opts.after ?? 250);
    },
    async type(target, text, { clear = true, delay = 70 } = {}) {
      await d.click(target);
      const l = loc(target).first();
      // no spell-check squiggles under field names on camera (Vp/Vs, Ekene, AVO)
      await l.evaluate((el) => { el.spellcheck = false; }).catch(() => {});
      if (clear) { await l.press('Control+A'); await l.press('Backspace'); }
      await l.pressSequentially(String(text), { delay });
      await sleep(200);
    },
    // A real click opens Chrome's native option list, which stays drawn over
    // the page on the recording; show the cursor and ripple, then set it.
    async select(target, value) {
      const p = await moveTo(target);
      await sleep(180);
      await page.evaluate(([x, y]) => window.__demo.ripple(x, y), [p.x, p.y]);
      await loc(target).first().selectOption(value);
      await sleep(400);
    },
    async highlight(target, { pad = 8 } = {}) { const b = await box(target); await page.evaluate(([bb, p]) => window.__demo.ring(bb, p), [b, pad]); },
    async unhighlight() { await page.evaluate(() => window.__demo.ring(null)); },
    async callout(id, target, text, side = 'right') { const b = await box(target); await page.evaluate(([i, bb, t, s]) => window.__demo.callout(i, bb, t, s), [id, b, text, side]); },
    async clearCallouts() { await page.evaluate(() => window.__demo.clearCallouts()); },
    async lowerThird(title, sub = '') { await page.evaluate(([t, s]) => window.__demo.lowerThird(t, s), [title, sub]); },
    async scroll(target, dy, { ms = 900 } = {}) {
      await moveTo(target);
      const n = Math.max(6, Math.round(ms / 50));
      for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await sleep(ms / n); }
    },
    async waitFor(target, opts = {}) { await loc(target).first().waitFor({ state: 'visible', timeout: opts.timeout ?? 60000 }); },
    async waitText(target, re, { timeout = 60000 } = {}) {
      const l = loc(target).first(); const t0 = Date.now();
      while (Date.now() - t0 < timeout) { const s = (await l.textContent().catch(() => '')) || ''; if (re.test(s)) return s; await sleep(150); }
      throw new Error(`Timed out waiting for ${re} in ${typeof target === 'string' ? target : 'locator'}`);
    },
    async slide(opts) { await page.evaluate((o) => window.__demo.slide(o), opts); await sleep(600); },
    async hideSlide() { await page.evaluate(() => window.__demo.hideSlide()); await sleep(600); },
    async text(target) { return ((await loc(target).first().textContent()) || '').trim(); },
  };
  return d;
}
