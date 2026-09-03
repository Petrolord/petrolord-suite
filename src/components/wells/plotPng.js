// Titled, logo-stamped PNG of a track canvas (Petrophysics Studio PS4,
// shared with Well Correlation since 2026-09-03). Pure DOM/canvas, no React.

/**
 * Compose the live track canvas into a titled, logo-stamped PNG blob
 * (PS4). The canvas already holds the full DPR-scaled render; a
 * branded header band goes above it and the suite watermark in the
 * bottom-right corner (skipped silently if the asset fails to load).
 */
export function trackPlotPng({ canvas, title }) {
  return new Promise((resolve, reject) => {
    const scale = (canvas.width / (canvas.clientWidth || canvas.width)) || 1;
    const headerH = Math.round(34 * scale);
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
    ctx.fillText(title, Math.round(10 * scale), Math.round(22 * scale));
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
