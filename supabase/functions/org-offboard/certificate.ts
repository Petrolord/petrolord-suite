// Certificate of Data Deletion renderer (pdf-lib, same library as
// generate-quote). Input is the field object from buildCertificateFields plus
// the verification code; output is the PDF bytes.
//
// Copy rules: plain sentences, no em dashes (owner rule for user-facing copy).

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const PAGE_W = 595.28;   // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 56;

const INK = rgb(0.10, 0.12, 0.16);
const MUTED = rgb(0.38, 0.42, 0.48);
const ACCENT = rgb(0.30, 0.55, 0.10);
const RULE = rgb(0.80, 0.83, 0.86);

export interface CertificateFields {
  certificate_no: string;
  organization_name: string;
  organization_id: string;
  requested_by_email: string;
  requested_at: string | null;
  effective_at: string | null;
  purged_at: string | null;
  summary: {
    totalRows: number;
    tablesAffected: number;
    rowsUnshared: number;
    objectsRemoved: number;
    accountsDeleted: number;
  };
  extra_org_names: string[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'n/a';
  return String(iso).slice(0, 10);
}

export async function renderCertificatePdf(fields: CertificateFields, verificationCode: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE_W - 2 * MARGIN;
  let y = PAGE_H - MARGIN;

  const wrap = (text: string, size: number, f = font): string[] => {
    const words = String(text).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(probe, size) > width) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const para = (text: string, size = 10.5, color = INK, f = font, leading = 1.45) => {
    for (const line of wrap(text, size, f)) {
      page.drawText(line, { x: MARGIN, y, size, font: f, color });
      y -= size * leading;
    }
    y -= 4;
  };

  const rule = () => {
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.8, color: RULE,
    });
    y -= 16;
  };

  const kv = (label: string, value: string) => {
    page.drawText(label, { x: MARGIN, y, size: 10, font, color: MUTED });
    page.drawText(value, { x: MARGIN + 190, y, size: 10, font: bold, color: INK });
    y -= 16;
  };

  // Header
  page.drawText('PETROLORD', { x: MARGIN, y, size: 13, font: bold, color: ACCENT });
  page.drawText('Lordsway Energy', {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize('Lordsway Energy', 10),
    y: y + 2, size: 10, font, color: MUTED,
  });
  y -= 34;
  page.drawText('CERTIFICATE OF DATA DELETION', { x: MARGIN, y, size: 19, font: bold, color: INK });
  y -= 24;
  rule();

  kv('Certificate number', fields.certificate_no);
  kv('Date of issue', fmtDate(fields.purged_at));
  y -= 8;

  para(
    `This certifies that all data belonging to the organization named below has been ` +
    `permanently deleted from the live systems of the Petrolord platform, following a ` +
    `closure request made by an administrator of that organization and the completion ` +
    `of the contractual grace period.`,
  );
  y -= 6;

  kv('Organization', fields.organization_name);
  kv('Organization reference', fields.organization_id);
  kv('Closure requested by', fields.requested_by_email);
  kv('Closure requested on', fmtDate(fields.requested_at));
  kv('End of grace period', fmtDate(fields.effective_at));
  kv('Deletion completed on', fmtDate(fields.purged_at));
  y -= 8;

  page.drawText('Scope of destruction', { x: MARGIN, y, size: 12, font: bold, color: INK });
  y -= 18;
  kv('Database records deleted', `${fields.summary.totalRows}`);
  kv('Tables affected', `${fields.summary.tablesAffected}`);
  kv('Stored files removed', `${fields.summary.objectsRemoved}`);
  kv('Member accounts deleted', `${fields.summary.accountsDeleted}`);
  kv('Records detached, not deleted', `${fields.summary.rowsUnshared}`);
  if (fields.extra_org_names.length) {
    para(
      `Personal workspaces removed together with the organization: ${fields.extra_org_names.join(', ')}.`,
      9.5, MUTED,
    );
  }
  para(
    `Detached records are items owned by people who remain members of other organizations ` +
    `on the platform. Their link to the deleted organization was removed; the items ` +
    `themselves belong to those individuals and were not part of the organization's data.`,
    9.5, MUTED,
  );
  y -= 2;

  para(
    `Copies of deleted data held inside encrypted database backups are not individually ` +
    `erasable and age out automatically as backups rotate. No deleted data is readable ` +
    `through the platform after the deletion date above.`,
    9.5, MUTED,
  );
  y -= 4;
  rule();

  page.drawText('Verification', { x: MARGIN, y, size: 12, font: bold, color: INK });
  y -= 18;
  para(
    `This certificate can be verified at any time at petrolord.com/legal/verify-deletion ` +
    `using the certificate number above and the verification code below. The verification ` +
    `service reads the deletion record directly from our systems, so a successful check ` +
    `confirms these facts independently of this document.`,
  );
  kv('Verification code', verificationCode);
  y -= 10;
  rule();

  para(
    `Issued electronically by the Petrolord platform, a product of Lordsway Energy. ` +
    `Questions about this certificate can be sent to support@petrolord.com.`,
    9, MUTED,
  );

  return await doc.save();
}

/** Uint8Array to base64, chunked so large PDFs never overflow the stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
