# NAPE booth leads: status

2026-10-10. Owner decisions:
- NAPE in November, in Nigeria.
- Visitors scan a QR code, fill a short form, and are handed over to WhatsApp Business +234 901 556 6981.
- Capture leads with a short form.

## What is built
- **The page: `/nape`** (`src/pages/events/NapeLeads.jsx`). It is public, mobile-first, a lazy route and not indexed.
  - Fields:
    - name and phone (WhatsApp) are required, with Nigerian numbers normalised;
    - email, company and role are optional;
    - interests (Suite, NextGen Academy, HSE, Consulting, something else);
    - a note;
    - the follow-up consent (NDPR), which is required;
    - a hidden honeypot.
  - On send, the lead is saved and WhatsApp opens with a greeting that names the visitor and their interests.
  - `?src=tablet` stays on the page with "Next visitor" for a booth tablet.
  - If the save fails (offline, or before the migration), the lead is kept on the phone and sent the next time the page opens. WhatsApp still works.
- **Logic** (`src/lib/eventLeads.js`): validation, phone normalisation, the wa.me link, the offline queue and the CSV.
  - `QUIZ_URL` is `/nape/quiz`: the done screen links to the booth quiz, the Petrolord Upstream Challenge (see NAPE-QUIZ-STATUS.md).
- **Storage:** `supabase/migrations/20261010150000_event_leads.sql`, a new table `event_leads`.
  - Visitors may insert only, with consent and length checks enforced in the database.
  - Platform super admins (`public.is_super_admin()`) read and delete.
  - No update path. No shared table is touched.
- **Staff view:** `/admin/event-leads` (super admin; button on the Super Admin Console) lists the leads and downloads a CSV.
- **QR codes:** `tools/nape/` (SVG for print, PNG), checked by decoding. Print sizes are in `tools/nape/README.md`.

## Tests
- `src/lib/__tests__/eventLeads.test.js` (10): phone forms, validation, the stored row, the WhatsApp link and its encoding, the offline queue and the CSV. Negative controls throughout.
- `src/pages/__tests__/NapeLeads.test.jsx` (3): consent required, a tablet lead saved with the right WhatsApp link, and before the table exists the lead is queued and sent on the next visit.
- `src/lib/__tests__/eventLeadsMigration.test.js` (3): policies, grants and checks.

## Owner items
1. Apply the migration (see MIGRATIONS.md). Until then the page works but leads stay on visitors' phones.
2. Print the QR codes (sizes in `tools/nape/README.md`).
3. Ship the next Suite zip so `/nape` is live.
4. Test end to end from a phone before the event.
