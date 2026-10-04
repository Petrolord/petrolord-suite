/**
 * WF-U2-004, the VRR side: "Send to Waterflood Design Studio" writes the
 * project id that Waterflood's Surveillance tab reads (?vrrProject=), and the
 * contract it previews is the one Waterflood takes. Negative control: a
 * period-grid project is refused, as the receiver refuses it.
 */
import fs from 'fs';
import path from 'path';
import { waterfloodLinkFor, WATERFLOOD_ROUTE } from '../VrrSendPanel';
import { projectPayload, defaultInputs } from '@/contexts/VrrMonitorContext';
import { buildVrrLedgerContract } from '@/utils/vrr/vrrLedgerContract';
import { surveillanceFromVrrLedger } from '@/utils/waterflooddesign/vrrIntake';

describe('VRR Monitor sends its ledger to Waterflood by id', () => {
  it('the link names the Surveillance tab and the project id; Waterflood reads that parameter', () => {
    expect(waterfloodLinkFor(WATERFLOOD_ROUTE, 'a b')).toBe('/dashboard/apps/reservoir/waterflood-design-studio?tab=surveillance&vrrProject=a%20b');
    const reader = fs.readFileSync(path.join(process.cwd(), 'src/components/waterflooddesign/VrrIntakePanel.jsx'), 'utf8');
    expect(reader).toMatch(/get\('vrrProject'\)/);
  });

  it('a saved ledger as the context saves it is what Waterflood takes; a period grid is refused', () => {
    const inputs = { ...defaultInputs(), mode: 'imported', wellRows: [{ date: '2025-01', well: 'P', oil_stb: 100, water_stb: 20 }, { date: '2025-01', well: 'I', winj_stb: 150 }] };
    const k = buildVrrLedgerContract({ projectId: 'v1', projectName: 'Ekene', payload: projectPayload({ id: 'v1', name: 'Ekene', inputs }) });
    expect(k.ok).toBe(true);
    expect(surveillanceFromVrrLedger(k.contract).ok).toBe(true);
    const grid = buildVrrLedgerContract({ projectId: 'v2', payload: projectPayload({ id: 'v2', name: 'g', inputs: defaultInputs() }) });
    expect(grid.ok).toBe(false);
  });
});
