// Suite Projects: how the switcher groups projects (pure; no I/O).
// Clients first (by name), each with its projects; projects without a
// client under "Internal", the Default project first there.

export const INTERNAL_LABEL = 'Internal';
// a right-pointing single guillemet between client and project, as in
// "Client X › Project A"
export const CRUMB = '›';

const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });

/**
 * @param {Array<{id, name, client_id, is_default}>} projects
 * @param {Array<{id, name, colour}>} clients
 * @returns {Array<{client: ?Object, label: string, projects: Array}>}
 */
export function groupProjectsByClient(projects, clients) {
  const byClient = new Map((clients || []).map((c) => [c.id, { client: c, label: c.name, projects: [] }]));
  const internal = { client: null, label: INTERNAL_LABEL, projects: [] };
  for (const p of projects || []) {
    const g = p.client_id && byClient.get(p.client_id);
    (g || internal).projects.push(p);
  }
  const groups = [...byClient.values()].sort((a, b) => byName(a.client, b.client));
  for (const g of groups) g.projects.sort(byName);
  internal.projects.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || byName(a, b));
  return [...groups, ...(internal.projects.length ? [internal] : [])];
}

/** "Client X › Project A", or the project name alone when it has no client. */
export function projectLabel(project, client) {
  if (!project) return '';
  return client ? `${client.name} ${CRUMB} ${project.name}` : project.name;
}
