// Titled, logo-stamped PNG of a map scene (Mapping MS1, 2026-09-05), the
// plotPng.js idiom for the wells kit: the caller re-paints the scene
// into an offscreen canvas at an explicit `scale` (an offscreen canvas
// reports clientWidth 0, so the scale is never derived from it).

/**
 * @param {{paint:(ctx:CanvasRenderingContext2D)=>void, width:number, height:number,
 *   title:string, caption?:string, scale?:number, logoSrc?:string}} p
 *   `paint` draws the CSS-px scene onto a context already scaled by `scale`.
 * @returns {Promise<Blob>}
 */
export function mapPlotPng({
  paint, width, height, title, caption = '', scale = 2, logoSrc = '/petrolord-chart-watermark.png',
}) {
  return new Promise((resolve, reject) => {
    const headerH = Math.round((caption ? 48 : 34) * scale);
    const out = document.createElement('canvas');
    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale) + headerH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, headerH);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, headerH - Math.max(1, Math.round(scale)), out.width, Math.max(1, Math.round(scale)));
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.round(12 * scale)}px sans-serif`;
    ctx.fillText(title, Math.round(10 * scale), Math.round(22 * scale));
    if (caption) {
      ctx.fillStyle = '#475569';
      ctx.font = `${Math.round(10 * scale)}px sans-serif`;
      ctx.fillText(caption, Math.round(10 * scale), Math.round(38 * scale));
    }
    ctx.save();
    ctx.translate(0, headerH);
    ctx.scale(scale, scale);
    paint(ctx);
    ctx.restore();

    const finish = () => out.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the map PNG.'));
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
    logo.src = logoSrc;
  });
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
