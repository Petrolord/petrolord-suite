// Report titles and period text (pure, no PDF library): shared by the
// screen and the exporters, so the screen never imports jsPDF.
import { toRigLocal } from '@/lib/wellsite/time';

export function reportTitle(model) {
  return model.kind === 'handover' ? `Shift handover, ${model.well.name}` : `Daily geological report, ${model.well.name}`;
}
export function periodText(model, offsetMin) {
  const a = toRigLocal(Date.parse(model.period.start), offsetMin).iso.replace('T', ' ');
  const b = toRigLocal(Date.parse(model.period.end), offsetMin).iso.replace('T', ' ');
  return `${model.period.label ? `${model.period.label}, ` : ''}${a} to ${b} rig time`;
}

/**
 * WS-U1-014 (PL7): the identity a reviewer reads before signing. The report
 * said "Depths in ft" with no reference, no KB and no build, so a reader could
 * not tell MD from TVD or which software made it. Latin-1 only (jsPDF fonts).
 * reviewer: { unit, kbElevM, preparedBy, build, operator }
 */
export function reviewerLines(model, { unit = 'ft', kbElevM = null, preparedBy = null, build = null } = {}) {
  const w = model.well || {};
  const kb = Number.isFinite(kbElevM) ? `${(unit === 'ft' ? kbElevM / 0.3048 : kbElevM).toFixed(1)} ${unit} above MSL` : 'not set';
  return [
    `Well ${w.name || 'n/a'}; field ${w.field || 'n/a'}; operator ${w.operator || 'n/a'}; rig ${w.rig || 'n/a'}.`,
    `Depths in ${unit}, measured depth (MD) below KB unless marked TVD; KB ${kb}.`,
    `Prepared by ${preparedBy || 'n/a'}; ${build || 'Petrolord Suite, Wellsite Studio'}.`,
  ];
}
