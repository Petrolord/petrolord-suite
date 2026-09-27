// Which quoted app a NextGen Expert bridge code discounts.
//
// A bridge code carries suite_module, the Suite module it was issued for.
// The Academy writes it as a Suite module SLUG (modules.slug: 'geoscience',
// 'midstream-downstream', 'data-ai', 'process-safety'). master_apps.module
// is a display name ('Geoscience', 'Midstream & Downstream', 'Data & AI'),
// which lowercases to the slug only for single-word modules, so matching on
// it silently skipped every multi-word module. The app's slug comes from
// modules.slug via master_apps.module_id, the same join QuoteBuilder uses
// (app.modules.slug) and the module-pricing branch of generate-quote uses.
//
// An app with no resolvable module slug (no module_id) falls back to its
// display name, which is how every match worked before, so nothing that
// matched then stops matching now.

const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();

export function bridgeCoversApp(
  suiteModule: unknown,
  appModuleSlug: unknown,
  appModuleName: unknown,
): boolean {
  const target = norm(suiteModule);
  if (!target) return false;
  const slug = norm(appModuleSlug);
  if (slug) return slug === target;
  return norm(appModuleName) === target;
}
