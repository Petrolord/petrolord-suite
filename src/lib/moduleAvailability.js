// Module access "Availability Overview": which Suite modules the
// organisation's active licences touch. The module list is SUITE_MODULES
// (src/data/suiteCatalog.js, the catalogue the homepage and Solutions page
// read; its slugs match modules.slug). Module UUIDs come from the live
// modules table so licences stored by UUID match too.
import { SUITE_MODULES } from '@/data/suiteCatalog';

const lower = (v) => String(v ?? '').toLowerCase().trim();

/**
 * @param licences     active purchased_modules rows; an app row may carry
 *                     parent_module_uuid (its master_apps.module_id)
 * @param moduleRows   rows from the modules table: { id, slug, name }
 * @returns [{ slug, name, active }] in SUITE_MODULES order
 */
export function moduleAvailability(licences = [], moduleRows = []) {
  const uuidBySlug = {};
  (moduleRows || []).forEach((m) => { if (m?.slug) uuidBySlug[lower(m.slug)] = lower(m.id); });

  return SUITE_MODULES.map((mod) => {
    const uuid = uuidBySlug[mod.slug] || null;
    const names = [mod.slug, lower(mod.name), lower(mod.short)];
    const active = (licences || []).some((l) => {
      const ids = [l.module_uuid, l.module_id, l.parent_module_uuid].map(lower).filter(Boolean);
      if (ids.includes(mod.slug)) return true;
      if (uuid && ids.includes(uuid)) return true;
      return names.includes(lower(l.module_name));
    });
    return { slug: mod.slug, name: mod.short || mod.name, active };
  });
}

/** Display name for a module-level licence row, or null. */
export function moduleLicenceName(licence, moduleRows = []) {
  const key = lower(licence?.module_uuid || licence?.module_id);
  if (!key) return null;
  const row = (moduleRows || []).find((m) => lower(m.id) === key || lower(m.slug) === key);
  const slug = row ? lower(row.slug) : key;
  const mod = SUITE_MODULES.find((m) => m.slug === slug);
  return mod ? mod.name : (row?.name || null);
}
