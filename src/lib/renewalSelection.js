// Renewals go through the normal quote-and-pay flow (owner decision
// 2026-09-28). This file turns what an organisation holds today into a
// pre-selection for the upgrade page (QuoteBuilder), which then prices it
// with the same rules as any new order and sends it to generate-quote and
// Paystack. Nothing here computes or sends a price.
//
// What the organisation holds:
//   * apps and their seat caps: the app-level purchased_modules rows
//     (app_uuid set; seats_allocated is the per-app cap manual_verify_quote
//     wrote from the paid quote). Module-level rows (app_id NULL) are skipped,
//     because manual_verify_quote writes one for any app bought a la carte
//     too, so they do not mean a whole-module licence was bought.
//   * whole-module licences: the module slugs on the active subscriptions
//     rows (subscriptions.modules is the paid quote's module list; HSE rides
//     along and is not a Suite module, so it is dropped).
//   * the billing term of the most recent active subscription.

export const RENEWAL_NON_SUITE_MODULES = ['hse_professional'];

const lower = (v) => String(v ?? '').toLowerCase().trim();

/** Pure: purchased_modules + subscriptions rows to { modules, apps, billingTerm }. */
export function buildRenewalSelection({ purchases = [], subscriptions = [] } = {}) {
  const seatsByApp = new Map();
  (purchases || []).forEach((p) => {
    if (p?.status && lower(p.status) !== 'active') return;
    const ref = p?.app_uuid || p?.app_id;
    if (!ref) return;
    const seats = Math.max(1, Math.floor(Number(p.seats_allocated)) || 1);
    seatsByApp.set(String(ref), Math.max(seatsByApp.get(String(ref)) || 0, seats));
  });

  const modules = new Set();
  const active = (subscriptions || []).filter((s) => !s?.status || lower(s.status) === 'active');
  active.forEach((s) => {
    (Array.isArray(s?.modules) ? s.modules : []).forEach((m) => {
      const slug = lower(typeof m === 'object' && m ? (m.slug ?? m.id ?? m.key) : m);
      if (slug && !RENEWAL_NON_SUITE_MODULES.includes(slug)) modules.add(slug);
    });
  });

  const latest = [...active].sort((a, b) => String(b?.end_date || '').localeCompare(String(a?.end_date || '')))[0];

  return {
    modules: [...modules],
    apps: [...seatsByApp].map(([id, seats]) => ({ id, seats })),
    billingTerm: latest?.term || null,
  };
}

/** Reads the organisation's current holdings (read-only queries). */
export async function loadRenewalSelection(supabase, organizationId) {
  const [{ data: purchases, error: pErr }, { data: subscriptions, error: sErr }] = await Promise.all([
    supabase.from('purchased_modules').select('*').eq('organization_id', organizationId).eq('status', 'active'),
    supabase.from('subscriptions').select('modules, term, end_date, status').eq('organization_id', organizationId).eq('status', 'active'),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;
  return buildRenewalSelection({ purchases: purchases || [], subscriptions: subscriptions || [] });
}

/**
 * Pure: map a renewal selection onto the loaded quote-builder catalogue, the
 * same way ticking the boxes by hand would. A module selects every app in it
 * (as handleModuleCheck does, one seat each); a held app is selected with its
 * held seat count (Coming Soon apps are skipped, as handleAppCheck does).
 * Returns what could not be found in today's catalogue so the page can say so.
 */
export function resolveRenewalSelection(selection, { masterApps = [], appsGroupedByModule = {} } = {}) {
  const groups = Object.values(appsGroupedByModule || {});
  const moduleIds = [];
  const missingModules = [];
  (selection?.modules || []).forEach((slug) => {
    const g = groups.find((m) => lower(m.slug) === lower(slug));
    if (g) moduleIds.push(g.id); else missingModules.push(slug);
  });

  const appIds = [];
  const seats = {};
  const add = (id, n) => {
    if (!appIds.includes(id)) appIds.push(id);
    seats[id] = Math.max(1, n || 1);
  };
  moduleIds.forEach((id) => (appsGroupedByModule[id]?.apps || []).forEach((a) => add(a.id, 1)));

  const missingApps = [];
  (selection?.apps || []).forEach(({ id, seats: n }) => {
    const app = masterApps.find((a) => a.id === id || (a.slug && a.slug === id));
    if (!app || lower(app.status) === 'coming soon') { missingApps.push(id); return; }
    add(app.id, n);
  });

  const billingTerm = selection?.billingTerm || null;
  return { moduleIds, appIds, seats, billingTerm, missingModules, missingApps };
}
