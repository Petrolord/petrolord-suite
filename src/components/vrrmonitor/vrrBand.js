// Status against the operator's own target band (senior test T1,
// 2026-09-27). The engine's classifyVRR keeps fixed 0.9 / 1.1 screening
// bands, so a cumulative VRR of 0.95 read "Balanced ... effective pressure
// maintenance" beside a 1.00 to 1.20 target and "2 / 3 periods out". The
// headline now answers against the band the user set; the engine's reading
// stays as a second line, with its dashes turned into plain punctuation.
import { classifyVRR } from '@/utils/vrrCalculations';

const plain = (s) => String(s || '').replace(/\s+—\s+/g, ': ');

export function statusAgainstBand(vrr, band) {
  const screen = classifyVRR(vrr);
  if (vrr == null || !Number.isFinite(vrr)) return { label: 'No data', tone: 'neutral', screen: null };
  const lo = Number(band?.min);
  const hi = Number(band?.max);
  const range = `${lo.toFixed(2)} to ${hi.toFixed(2)}`;
  const base = Number.isFinite(lo) && Number.isFinite(hi)
    ? (vrr < lo
      ? { label: `Below your target band (${range}): produced voidage is not being fully replaced.`, tone: 'warn' }
      : vrr > hi
        ? { label: `Above your target band (${range}): injecting more than the plan calls for.`, tone: 'info' }
        : { label: `Within your target band (${range}).`, tone: 'good' })
    : { label: plain(screen.label), tone: screen.tone };
  return { ...base, screen: `Screening bands (0.9 to 1.1): ${plain(screen.label)}` };
}
