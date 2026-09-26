// Prospect card (Mapping T1 enhancement E3, 2026-09-26): one page from a
// closure: the map as printed, and the numbers a prospect review reads
// first (crest, spill, closed area, GRV and its range, contact, whether
// the closure is closed on the map). A PNG, white page, Petrolord mark.

/**
 * @param {{mapBlob: Blob, title: string, rows: Array<[string, string]>, note?: string,
 *   logoSrc?: string}} p
 * @returns {Promise<Blob>}
 */
export function prospectCardPng({ mapBlob, title, rows, note = '', logoSrc = '/petrolord-chart-watermark.png' }) {
  return new Promise((resolve, reject) => {
    const mapImg = new Image();
    mapImg.onload = () => {
      const W = 1600;
      const mapW = 1040;
      const mapH = Math.round(mapImg.naturalHeight * (mapW / mapImg.naturalWidth));
      const H = Math.max(mapH + 140, 900);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(title, 40, 60);
      ctx.fillStyle = '#475569'; ctx.font = '18px sans-serif'; ctx.fillText(`Prospect card · ${new Date().toISOString().slice(0, 10)}`, 40, 92);
      ctx.drawImage(mapImg, 40, 120, mapW, mapH);
      let y = 150;
      const x = mapW + 80;
      ctx.font = '18px sans-serif';
      for (const [k, v] of rows) {
        ctx.fillStyle = '#64748b'; ctx.fillText(k, x, y);
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(v, x, y + 28);
        ctx.font = '18px sans-serif';
        y += 70;
      }
      if (note) {
        ctx.fillStyle = '#b45309'; ctx.font = '16px sans-serif';
        const words = note.split(' ');
        let line = '';
        for (const w of words) {
          if (ctx.measureText(`${line} ${w}`).width > W - x - 40) { ctx.fillText(line, x, y); y += 22; line = w; } else line = line ? `${line} ${w}` : w;
        }
        if (line) ctx.fillText(line, x, y);
      }
      const done = () => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the prospect card.'))), 'image/png');
      const logo = new Image();
      logo.onload = () => { const h = 44; ctx.drawImage(logo, W - 40 - h * (logo.naturalWidth / logo.naturalHeight), 24, h * (logo.naturalWidth / logo.naturalHeight), h); done(); };
      logo.onerror = done;
      logo.src = logoSrc;
    };
    mapImg.onerror = () => reject(new Error('Could not read the map image.'));
    mapImg.src = URL.createObjectURL(mapBlob);
  });
}
