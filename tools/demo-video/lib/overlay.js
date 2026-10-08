// Injected into every page of a recording (page.addInitScript). Draws the
// presenter layer on top of the app: a visible cursor with eased movement and
// a click ripple, a highlight ring, callout boxes and a chapter lower-third.
// It is pure DOM in a fixed, pointer-events:none layer, so it never changes
// what the app does. Sized for a TV across a booth: the page is 1920x1080 CSS
// pixels, captured at 2560x1440 and finished at 3840x2160.
(() => {
  if (window.__demo || window.top !== window) return; // top frame only
  const GOLD = '#d4ac3a'; const INK = '#10221a'; const PAPER = '#fbfaf5';
  const css = `
  #__demo{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,"Instrument Sans",system-ui,sans-serif}
  #__demo .cur{position:absolute;left:0;top:0;width:34px;height:34px;transform:translate(960px,540px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  #__demo .rip{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:3px solid ${GOLD};opacity:.95;animation:__rip .6s ease-out forwards}
  @keyframes __rip{to{transform:scale(3.4);opacity:0}}
  #__demo .ring{position:absolute;border:4px solid ${GOLD};border-radius:10px;box-shadow:0 0 0 9999px rgba(8,18,13,.28);transition:opacity .35s ease,left .45s ease,top .45s ease,width .45s ease,height .45s ease;opacity:0}
  #__demo .call{position:absolute;max-width:440px;background:${INK};color:${PAPER};padding:14px 18px;border-radius:10px;font-size:22px;line-height:1.3;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.35);border-left:5px solid ${GOLD};opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease}
  #__demo .call.on{opacity:1;transform:none}
  #__demo .lt{position:absolute;left:48px;top:84px;background:${INK};color:${PAPER};padding:16px 26px 16px 22px;border-radius:8px;border-left:6px solid ${GOLD};opacity:0;transform:translateX(-24px);transition:opacity .45s ease,transform .45s ease;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  #__demo .lt.on{opacity:1;transform:none}
  #__demo .lt b{display:block;font-size:30px;font-weight:650;letter-spacing:.01em}
  #__demo .lt span{display:block;font-size:19px;color:#c9d3cb;margin-top:4px}
  /* the service-worker "ready offline" note is for real users, not the camera */
  [data-testid="pwa-prompt"]{display:none!important}
  `;
  const arrow = `<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2 L3 19 L7.6 14.8 L10.6 21.6 L13.6 20.3 L10.7 13.6 L17 13.4 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  let layer; let cur; let ring; let lt; let pos = { x: 960, y: 540 };
  const calls = new Map();
  function mount() {
    if (layer && document.documentElement.contains(layer)) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    layer = document.createElement('div'); layer.id = '__demo';
    layer.innerHTML = `<div class="ring"></div><div class="lt"><b></b><span></span></div><div class="cur">${arrow}</div>`;
    document.documentElement.appendChild(layer);
    cur = layer.querySelector('.cur'); ring = layer.querySelector('.ring'); lt = layer.querySelector('.lt');
    cur.style.transform = `translate(${pos.x}px,${pos.y}px)`;
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  window.__demo = {
    moveTo(x, y, ms = 700) {
      mount();
      const from = { ...pos }; const t0 = performance.now();
      // a slight arc reads as a hand, a straight line as a robot
      const bend = Math.min(80, Math.hypot(x - from.x, y - from.y) * 0.12);
      return new Promise((res) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms); const e = ease(t);
          const nx = from.x + (x - from.x) * e; const ny = from.y + (y - from.y) * e - Math.sin(Math.PI * e) * bend;
          cur.style.transform = `translate(${nx}px,${ny}px)`;
          if (t < 1) requestAnimationFrame(step); else { pos = { x, y }; res(); }
        };
        requestAnimationFrame(step);
      });
    },
    ripple(x = pos.x, y = pos.y) {
      mount(); const r = document.createElement('div'); r.className = 'rip';
      r.style.left = `${x}px`; r.style.top = `${y}px`; layer.appendChild(r); setTimeout(() => r.remove(), 700);
    },
    ring(box, pad = 8) {
      mount();
      if (!box) { ring.style.opacity = '0'; return; }
      Object.assign(ring.style, { left: `${box.x - pad}px`, top: `${box.y - pad}px`, width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`, opacity: '1' });
    },
    callout(id, box, text, side = 'right') {
      mount();
      let el = calls.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'call'; layer.appendChild(el); calls.set(id, el); }
      el.textContent = text;
      const w = Math.min(440, el.offsetWidth || 440); const h = el.offsetHeight || 60; const g = 22;
      let x = side === 'left' ? box.x - w - g : side === 'below' || side === 'above' ? box.x : box.x + box.width + g;
      let y = side === 'below' ? box.y + box.height + g : side === 'above' ? box.y - h - g : box.y + box.height / 2 - h / 2;
      x = Math.max(16, Math.min(innerWidth - w - 16, x)); y = Math.max(16, Math.min(innerHeight - h - 16, y));
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      requestAnimationFrame(() => el.classList.add('on'));
    },
    clearCallouts() { for (const el of calls.values()) { el.classList.remove('on'); setTimeout(() => el.remove(), 400); } calls.clear(); },
    lowerThird(title, sub = '') {
      mount();
      if (!title) { lt.classList.remove('on'); return; }
      lt.querySelector('b').textContent = title; lt.querySelector('span').textContent = sub;
      lt.querySelector('span').style.display = sub ? 'block' : 'none';
      requestAnimationFrame(() => lt.classList.add('on'));
    },
    get pos() { return pos; },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
