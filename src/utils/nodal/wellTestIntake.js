// Nodal Analysis Studio intake of a Well Test Analysis Studio project
// (2026-10-14). Well Test writes the wta-1 record into every save; its
// `productivity` block (src/lib/wellTestSource.js) carries the test rate, the
// flowing pressure, pr (p* or pi) and J = q / (pr - pwf), with the PI that has
// the skin pressure drop removed. Nodal opens with ?wellTestProject=<id>,
// reads the record by id and shows it on a card in the inflow panel; nothing
// changes until the user picks one of the two choices:
//   'asTested'    pr = pr_psia, J = pi_stbd_psi
//   'skinRemoved' pr = pr_psia, J = ideal_pi_stbd_psi
// The IPR model becomes the straight-line PI unless it is already composite
// (Standing), which keeps its bubble point: the Well Test has none, so the
// bubble point stays the Nodal entry. State stays oilfield (psia, STB/D/psi).
import { WTA_PROJECT_PARAM, WTA_APP } from '@/lib/wellTestSource';

/** The production route and the /dev harness route of Nodal Analysis Studio. */
export const NODAL_STUDIO_ROUTES = Object.freeze(['/dashboard/apps/production/nodal-analysis-studio', '/dev/nodal-analysis-studio']);

/** The address that opens Nodal on a saved Well Test project, or null without an id. */
export function nodalStudioHref(wellTestProjectId, { inHarness = false } = {}) {
  if (wellTestProjectId == null || String(wellTestProjectId) === '') return null;
  return `${NODAL_STUDIO_ROUTES[inHarness ? 1 : 0]}?${WTA_PROJECT_PARAM}=${encodeURIComponent(wellTestProjectId)}`;
}

export const WELL_TEST_CHOICES = Object.freeze({
  asTested: 'As tested',
  skinRemoved: 'Skin removed',
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// state strings: enough digits that a round trip shows the sent value
const str = (v) => String(parseFloat(Number(v).toPrecision(8)));

/**
 * Whether a wta-1 record can feed the Nodal inflow, and why not.
 * @returns {{ok: boolean, reason: ?string}}
 */
export function wellTestProductivityStatus(contract) {
  if (!contract) return { ok: false, reason: 'No Well Test Analysis Studio record was read.' };
  if (contract.fluid === 'gas') return { ok: false, reason: 'This Well Test is a gas test. Nodal takes a productivity index from oil tests only; enter the gas deliverability here.' };
  const p = contract.productivity;
  if (!p) {
    return {
      ok: false,
      reason: contract.productivity_withheld
        ? `The Well Test record holds no productivity index: ${contract.productivity_withheld}`
        : 'The Well Test record holds no productivity index. Open the project in Well Test Analysis Studio and save it once.',
    };
  }
  if (!(finite(p.pi_stbd_psi) && p.pi_stbd_psi > 0) || !(finite(p.pr_psia) && p.pr_psia > 0)) {
    return { ok: false, reason: 'The productivity block of the Well Test record is incomplete.' };
  }
  return { ok: true, reason: null };
}

/**
 * The inflow patch and the provenance for one choice.
 * @param {object} contract the wta-1 record
 * @param {'asTested'|'skinRemoved'} choice
 * @param {object} [currentInflow] the Nodal inflow state (decides whether composite is kept)
 * @param {{projectId?: string, projectName?: string, now?: string}} [o]
 * @returns {{ok: boolean, reason: ?string, patch: ?object, provenance: ?object}}
 */
export function nodalInflowFromWellTest(contract, choice, currentInflow = {}, { projectId = null, projectName = null, now = new Date().toISOString() } = {}) {
  const refuse = (reason) => ({ ok: false, reason, patch: null, provenance: null });
  if (!WELL_TEST_CHOICES[choice]) return refuse('Unknown choice.');
  const status = wellTestProductivityStatus(contract);
  if (!status.ok) return refuse(status.reason);
  const p = contract.productivity;
  const J = choice === 'skinRemoved' ? p.ideal_pi_stbd_psi : p.pi_stbd_psi;
  if (!(finite(J) && J > 0)) {
    return refuse('The Well Test gives no skin-removed productivity index (skin is withheld, or the skin pressure drop is not below the drawdown).');
  }
  const keepComposite = currentInflow?.wellType !== 'gas' && currentInflow?.model === 'composite';
  const patch = {
    wellType: 'oil',
    model: keepComposite ? 'composite' : 'pi',
    calMode: 'pi',
    pr: str(p.pr_psia),
    pi: str(J),
  };
  const provenance = {
    contract: contract.contract,
    app: WTA_APP,
    project_id: projectId ?? contract.project?.id ?? null,
    project_name: projectName || contract.project?.name || null,
    well: contract.project?.well || null,
    test_type: p.test_type || contract.project?.test_type || null,
    test_dates: contract.project?.test_dates || null,
    method: contract.permeability?.method || null,
    choice,
    choice_label: WELL_TEST_CHOICES[choice],
    model: patch.model,
    pr_psia: p.pr_psia,
    pr_method: p.pr_method,
    q_stb_d: p.q_stb_d,
    pwf_psia: p.pwf_psia,
    pi_stbd_psi: J,
    pi_as_tested_stbd_psi: p.pi_stbd_psi,
    ideal_pi_stbd_psi: p.ideal_pi_stbd_psi ?? null,
    flow_efficiency: p.flow_efficiency ?? null,
    record_computed_at: contract.computed_at || null,
    applied_at: now,
  };
  return { ok: true, reason: null, patch, provenance };
}

/** Whether the inflow on screen still holds what an intake set (pr and J unchanged). */
export function wellTestIntakeCurrent(intake, inflow) {
  if (!intake || !inflow) return false;
  const close = (a, b) => Math.abs(parseFloat(a) - b) <= 1e-6 * Math.max(1, Math.abs(b));
  return inflow.wellType !== 'gas' && close(inflow.pr, intake.pr_psia) && close(inflow.pi, intake.pi_stbd_psi);
}
