// Titled, logo-stamped PNG of a track canvas (Petrophysics Studio PS4,
// shared with Well Correlation since 2026-09-03). Pure DOM/canvas, no React.

/**
 * Compose a track canvas into a titled, logo-stamped PNG blob (PS4). The
 * canvas already holds the full render; a branded header band goes above
 * it and the suite watermark in the bottom-right corner (skipped silently
 * if the asset fails to load).
 *
 * @param {HTMLCanvasElement} p.canvas the rendered plot
 * @param {string} p.title bold first line of the header band
 * @param {string} [p.caption] small second line — PT8 uses it for the
 *   well, the exported depth range and the datum, so a saved image says
 *   what it is without the app around it
 * @param {number} [p.scale] pixels per CSS pixel in `canvas`, so the band
 *   is drawn at the image's own resolution. Defaults to the canvas's own
 *   backing-store ratio, which is right for a live on-screen canvas but
 *   reads as 1 for an offscreen one (clientWidth 0) — an offscreen render
 *   must pass the scale it drew at.
 */
export function trackPlotPng({ canvas, title, caption = '', scale: scaleIn }) {
  return new Promise((resolve, reject) => {
    const scale = scaleIn || (canvas.width / (canvas.clientWidth || canvas.width)) || 1;
    const headerH = Math.round((caption ? 48 : 34) * scale);
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + headerH;
    const ctx = out.getContext('2d');
    // white header band with a slate rule, matching the white track canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, headerH);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, headerH - Math.max(1, Math.round(scale)), out.width, Math.max(1, Math.round(scale)));
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.round(12 * scale)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(title, Math.round(10 * scale), Math.round(22 * scale));
    if (caption) {
      ctx.fillStyle = '#475569';
      ctx.font = `${Math.round(10 * scale)}px sans-serif`;
      ctx.fillText(caption, Math.round(10 * scale), Math.round(38 * scale));
    }
    ctx.drawImage(canvas, 0, headerH);

    const finish = () => out.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the track plot PNG.'));
    }, 'image/png');

    const logo = new Image();
    logo.onload = () => {
      const h = Math.round(28 * scale);
      const w = Math.round(h * (logo.naturalWidth / (logo.naturalHeight || 1)));
      ctx.globalAlpha = 0.7;
      ctx.drawImage(logo, out.width - w - Math.round(8 * scale), out.height - h - Math.round(8 * scale), w, h);
      ctx.globalAlpha = 1;
      finish();
    };
    logo.onerror = finish;
    logo.src = '/petrolord-chart-watermark.png';
  });
}
