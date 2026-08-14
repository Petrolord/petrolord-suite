// Shared Petrolord PDF branding for jsPDF reports (D5,
// docs/scope/Economics-ROADMAP.md). Extracted from ReservoirCalc Pro's
// ReportGenerator banner so other apps can produce the same boardroom
// header without forking it. RC Pro still carries its own copy inside
// ReportGenerator.jsx (consolidating it onto this module without
// disturbing its export test suite is parked follow-up work).

// Ellipsize text to a width using jsPDF's own metrics (html2canvas-style
// CSS truncation does not exist inside jsPDF).
export function fitText(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

// Petrolord brand mark: the clean transparent-background watermark asset
// (petrolord-icon.png is a JPEG with a baked-in dark background; never use
// it on report surfaces). Cached as a downscaled data URL; resolves to
// null when unavailable so reports still generate without the logo.
let _logoPromise;
export function loadPetrolordLogo() {
  if (_logoPromise) return _logoPromise;
  _logoPromise = (async () => {
    try {
      const resp = await fetch('/petrolord-chart-watermark.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = dataUrl;
      });
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const targetH = 240;
      if (h > targetH) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round((w / h) * targetH);
          canvas.height = targetH;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
        } catch { /* fall back to the original */ }
      }
      return { dataUrl, w, h };
    } catch {
      return null;
    }
  })();
  return _logoPromise;
}

// Slate banner across the top of a report page. Right-hand context lines
// are ellipsized to the space left of the title.
export function drawBrandHeader(doc, {
  logo, margin, pageWidth, appTitle, subtitle, rightLines = [],
}) {
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 30, 'F');
  let titleX = margin;
  if (logo) {
    const h = 15;
    const w = h * (logo.w / logo.h);
    try { doc.addImage(logo.dataUrl, 'PNG', margin, 7.5, w, h); titleX = margin + w + 5; } catch { /* skip logo */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const title = `Petrolord Suite - ${appTitle}`;
  doc.text(title, titleX, 13);
  const titleEnd = titleX + doc.getTextWidth(title);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 225);
  if (subtitle) doc.text(subtitle, titleX, 21);
  doc.setTextColor(255, 255, 255);
  const rightMax = Math.max(20, pageWidth - margin - titleEnd - 6);
  const ys = [9, 16, 23];
  rightLines.slice(0, 2).forEach((line, i) => {
    doc.text(fitText(doc, line, rightMax), pageWidth - margin, ys[i], { align: 'right' });
  });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, 23, { align: 'right' });
  return 30; // banner height
}
