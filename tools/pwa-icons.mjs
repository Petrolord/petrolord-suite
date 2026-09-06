// Regenerate the installable-app icons (WS6): node tools/pwa-icons.mjs, from the repo root.
// Render the Petrolord icon (a JPEG named .png) to real 192 and 512 px PNGs with Chromium's canvas.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const src = fs.readFileSync('public/petrolord-icon.png').toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [192, 512]) {
  const dataUrl = await page.evaluate(async ({ src, size }) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / img.width, size / img.height) * 0.86;
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/png');
  }, { src, size });
  fs.writeFileSync(`public/icons/icon-${size}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await browser.close();
console.log('icons written');
