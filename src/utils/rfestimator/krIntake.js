/**
 * The kr-1 oil-water set taken by id from a SCAL Studio project for the
 * displacement x sweep method (RF-U2-009). The record keeps the Corey
 * parameters the engine reads, where they came from and when, so the
 * report prints the source and a later read can say the source changed.
 *
 * Pure.
 */
import { krContractSourceText } from '@/lib/inputProvenance/krContract';

const KEYS = ['Swc', 'Sor', 'krwMax', 'kroMax', 'nw', 'no'];

/**
 * @param {object} contract a kr-1 block (validated by the reader)
 * @param {{projectId?: string, projectName?: ?string, now?: string}} o
 * @returns {{ok: true, intake: object}|{ok: false, error: string}}
 */
export function rfKrIntake(contract, { projectId = null, projectName = null, now = new Date().toISOString() } = {}) {
  const set = contract?.oil_water;
  if (!set?.params) return { ok: false, error: 'The SCAL project holds no oil-water set.' };
  const params = Object.fromEntries(KEYS.map((k) => [k, Number(set.params[k])]));
  if (KEYS.some((k) => !Number.isFinite(params[k]))) return { ok: false, error: 'The oil-water set is incomplete.' };
  return {
    ok: true,
    intake: {
      contract: 'kr-1',
      recordId: projectId || contract.project_id || null,
      recordName: projectName || contract.project_name || null,
      params,
      source: krContractSourceText(contract, 'oil_water'),
      generatedAt: contract.generated_at || null,
      takenAt: now,
    },
  };
}

/** What the source holds now against what was taken, or null when unchanged. */
export function krChangedSince(intake, latest) {
  if (!intake || !latest?.oil_water?.params) return null;
  const moved = KEYS.filter((k) => Number(latest.oil_water.params[k]) !== intake.params[k]);
  return moved.length ? `The SCAL project changed after the intake (${moved.join(', ')}). Take it again to use it.` : null;
}
