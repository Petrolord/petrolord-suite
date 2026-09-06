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
