// Certificate of Export renderer (Project Portability PP5). Same page
// grammar as the Certificate of Data Deletion (org-offboard/certificate.ts):
// A4, Helvetica, a facts table, a contents table, a verification section
// that points at /legal/verify-export.

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.44, 0.5);
const ACCENT = rgb(0.2, 0.55, 0.35);
const RULE = rgb(0.82, 0.85, 0.88);

export interface ExportCertificateFields {
  certificate_no: string;
  package_id: string;
  package_name: string | null;
  exported_at: string;
  exporter_email: string | null;
  organization_name: string | null;
  manifest_digest: string;
  signature_key_id: string | null;
  platform_sha: string | null;
  tables: Record<string, number>;
  rows_total: number;
  blobs: number;
  parts: number;
}

export async function renderExportCertificatePdf(f: ExportCertificateFields, appUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate of Export ${f.certificate_no}`);
  doc.setAuthor('Petrolord (Lordsway Energy)');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const width = PAGE_W - 2 * MARGIN;

  const wrap = (text: string, size: number, fnt = font, maxW = width): string[] => {
    const words = String(text).split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (fnt.widthOfTextAtSize(next, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const ensure = (h: number) => { if (y - h < MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } };
  const para = (text: string, size = 10, color = INK, fnt = font) => {
    for (const line of wrap(text, size, fnt)) { ensure(size + 4); page.drawText(line, { x: MARGIN, y, size, font: fnt, color }); y -= size + 4; }
    y -= 4;
  };
  const rule = () => { ensure(10); page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: RULE }); y -= 12; };
  const kv = (label: string, value: string, mono = false) => {
    ensure(14);
    page.drawText(label, { x: MARGIN, y, size: 9.5, font: bold, color: MUTED });
    const lines = wrap(value, mono ? 8.5 : 10, font, width - 190);
    for (const [i, line] of lines.entries()) { if (i) { y -= 12; ensure(12); } page.drawText(line, { x: MARGIN + 190, y, size: mono ? 8.5 : 10, font, color: INK }); }
    y -= 15;
  };

  page.drawText('PETROLORD', { x: MARGIN, y, size: 12, font: bold, color: ACCENT });
  const org = 'Lordsway Energy';
  page.drawText(org, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(org, 9), y: y + 1, size: 9, font, color: MUTED });
  y -= 30;
  page.drawText('Certificate of Export', { x: MARGIN, y, size: 19, font: bold, color: INK });
  y -= 24;
  para(`Certificate number ${f.certificate_no}`, 10.5, MUTED, bold);
  rule();

  para('This certifies that the Petrolord Project Package identified below was written by Petrolord Suite on behalf of the account named, and that its manifest, listing every file in the package with its size and SHA-256 checksum, was signed by the platform key at the moment of export. Any later change to the package is detectable by anyone holding this certificate and the package.', 10);
  rule();

  kv('Package name', f.package_name || '(unnamed)');
  kv('Package id', f.package_id, true);
  kv('Exported at (UTC)', f.exported_at);
  kv('Exported by', f.exporter_email || '(account)');
  kv('Organization', f.organization_name || 'private account');
  kv('Platform build', f.platform_sha || 'unknown');
  kv('Manifest SHA-256', f.manifest_digest, true);
  kv('Signing key', f.signature_key_id || 'unsigned');
  kv('Parts', String(f.parts));
  kv('Binary files', String(f.blobs));
  rule();

  para('Contents', 12, INK, bold);
  const entries = Object.entries(f.tables || {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [t, n] of entries) kv(t, `${n} row${n === 1 ? '' : 's'}`);
  kv('Total rows', String(f.rows_total));
  rule();

  para('Verification', 12, INK, bold);
  para(`Anyone can confirm this certificate at ${appUrl.replace(/\/$/, '')}/legal/verify-export by entering the certificate number and the verification code that was issued with it. The page returns the facts above from Petrolord's records. To check a package against this certificate, compute the SHA-256 of its canonical manifest (manifest.json with the signature field removed and keys sorted) and compare it with the manifest SHA-256 printed here; Petrolord's Import package dialog does this and also checks the signature.`, 9.5, MUTED);
  y -= 6;
  para('Issued automatically by Petrolord Suite. This certificate records what was exported and when; it makes no statement about the completeness of the exporting account beyond the contents listed.', 8.5, MUTED);

  return doc.save();
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
