// "Re-run prospect" (Risked Reserves Valuation U2-006, 2026-10-02; the
// owner item of ReservoirCalc Pro's Step 2). A valuation whose prospect
// changed, or that is flagged, opens ReservoirCalc Pro on that prospect
// ready to re-run: the prospect's own source block (`inputs.source`, saved
// since the RL re-check) names the project, the reservoir and the Monte
// Carlo run behind its volumes. Pure: what can be done, and why not.
//
// A prospect is never edited in place in ReservoirCalc Pro; it is added and
// deleted. So the re-run is added as a new record that names the one it
// replaces (`inputs.source.replaces`), and the old record is retired when
// the user owns it. Risked Reserves Valuation follows the new record.

const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;

/** The route a "Return to the valuation" link may go back to: a path in this app, nothing else. */
export function safeReturnPath(raw, fallback = '/dashboard/apps/reservoir/risked-reserves-valuation') {
  return typeof raw === 'string' && SAFE_PATH.test(raw) && !raw.startsWith('//') ? raw : fallback;
}

/** The link back to the valuation, asking it to take the re-run. */
export function returnHref(returnTo, prospectId) {
  return `${safeReturnPath(returnTo)}?refresh=${encodeURIComponent(prospectId)}`;
}

/**
 * @param {{prospect: ?object, own: boolean, projects: Array, userId: ?string}} a
 *   `prospect` the rcp_prospects row asked for (own or shared), `projects`
 *   the projects this user can open (own and shared)
 * @returns {{state: 'missing'|'no-source'|'typed'|'project-missing'|'ready', message: string,
 *   readOnly: boolean, readOnlyReason?: string, prospect?: object, project?: object,
 *   reservoirId?: ?string, reservoirName?: ?string, seed?: ?number, iterations?: ?number}}
 */
export function rerunPlan({ prospect, own, projects = [], userId = null }) {
  if (!prospect) {
    return { state: 'missing', readOnly: true, message: 'This prospect is not in your inventory and is not shared with you. It may have been deleted, or its owner stopped sharing it.' };
  }
  const readOnly = !own;
  const readOnlyReason = readOnly
    ? 'This prospect belongs to a colleague and is shared with you for viewing, so it opens read-only: you can run the volumes again, but only its owner can re-risk it. Add your own version with Prospect Risking to value it yourself.'
    : undefined;
  const base = { prospect, readOnly, readOnlyReason };
  const src = prospect.inputs?.source;
  if (!src || typeof src !== 'object') {
    return { ...base, state: 'no-source', message: `"${prospect.name}" was saved before ReservoirCalc Pro recorded the project and run behind it, so it cannot be opened for you. Open its project from Projects, run the Monte Carlo, and add the prospect again in Prospect Risking.` };
  }
  if (src.volumesFrom === 'entered') {
    return { ...base, state: 'typed', message: `The volumes of "${prospect.name}" were typed in Prospect Risking, not made by a Monte Carlo run, so there is no run to repeat. Change them in Prospect Risking and add the prospect again.` };
  }
  const project = (projects || []).find((p) => p.id === src.projectId) || null;
  if (!project) {
    return { ...base, state: 'project-missing', message: `The project behind "${prospect.name}"${src.projectName ? ` ("${src.projectName}")` : ''} is not on your account and is not shared with you, so it cannot be opened.` };
  }
  const reservoir = Array.isArray(project.reservoirs) ? project.reservoirs.find((r) => r.id === src.reservoirId) : null;
  const theirs = project.user_id && userId && project.user_id !== userId;
  const seed = Number.isFinite(src.run?.seed) ? src.run.seed : null;
  const iterations = Number.isFinite(src.run?.iterations) ? src.run.iterations : null;
  const parts = [
    `Opened project "${project.name}"${reservoir ? `, reservoir "${reservoir.name}"` : (src.reservoirName ? ` (reservoir "${src.reservoirName}" is not in this project now, so the open one is shown)` : '')}.`,
    seed !== null ? `The run behind "${prospect.name}" used seed ${seed}${iterations ? ` and ${iterations.toLocaleString('en-US')} realizations` : ''}: both are set in the Probabilistic panel, so the same inputs give the same volumes and a changed input shows as a change.` : 'The run behind it recorded no seed: a new seed is used.',
    theirs ? 'The project is a colleague\'s: it opens as they shared it (read-only unless they let you edit).' : null,
  ].filter(Boolean);
  return { ...base, state: 'ready', project, reservoirId: reservoir ? reservoir.id : null, reservoirName: reservoir?.name || null, seed, iterations, message: parts.join(' ') };
}

/** The inputs.source of the re-run: as built for any prospect, plus the record it replaces. */
export const replacing = (source, oldId) => (source ? { ...source, replaces: oldId } : { replaces: oldId });
