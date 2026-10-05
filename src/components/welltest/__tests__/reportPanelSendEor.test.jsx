// EOR-U2-002: Well Test sends its saved project to EOR Screening by id. The
// project is saved first (EOR reads the saved wta-1 record), nothing travels
// in router state, and an unsaved workspace is not sent.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const ctx = {};
jest.mock('@/contexts/WellTestStudioContext', () => ({ useWellTestStudio: () => ctx }));
jest.mock('@/utils/wellTestReportExport', () => ({ exportWellTestPdf: jest.fn(), collectReportArgs: jest.fn() }));
// eslint-disable-next-line import/first
import ReportPanel from '@/components/welltest/ReportPanel';

const WTA = { contract: 'wta-1', project: { name: 'EK-3 buildup', well: 'EK-3' }, fluid: 'oil', permeability: { value: 182.4, method: 'Horner straight line' }, pressure: { average_psia: 3985 }, computed_at: '2026-10-03T09:00:00Z' };

const Where = () => { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}|{JSON.stringify(l.state)}</p>; };
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dev/well-test-analysis-studio" element={<ReportPanel />} />
        <Route path="/dashboard/apps/reservoir/well-test-analysis-studio" element={<ReportPanel />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(ctx, {
    notes: '', setNotes: jest.fn(), projectName: 'EK-3 buildup', wellName: 'EK-3', addNotification: jest.fn(),
    prepared: { points: [] }, currentProjectId: 'wt-1', wtaRecord: WTA, serializeInputs: jest.fn(), importProjectPayload: jest.fn(),
    manualSave: jest.fn(async () => true),
  });
});

describe('Well Test: Send to EOR Screening', () => {
  it('saves first, then opens EOR Screening with the project named by id (no router state)', async () => {
    renderAt('/dashboard/apps/reservoir/well-test-analysis-studio');
    fireEvent.click(screen.getByTestId('wts-send-eor'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/apps/reservoir/eor-screening?wellTestProject=wt-1|null'));
    expect(ctx.manualSave).toHaveBeenCalledTimes(1);
  });
  it('stays in the /dev harness', async () => {
    renderAt('/dev/well-test-analysis-studio');
    fireEvent.click(screen.getByTestId('wts-send-eor'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/dev/studio/eor?wellTestProject=wt-1'));
  });
  it('negative controls: an unsaved workspace is not sent; a failed save does not navigate', async () => {
    ctx.currentProjectId = null;
    const { unmount } = renderAt('/dev/well-test-analysis-studio');
    expect(screen.getByTestId('wts-send-eor')).toBeDisabled();
    unmount();
    ctx.currentProjectId = 'wt-1';
    ctx.manualSave = jest.fn(async () => false);
    renderAt('/dev/well-test-analysis-studio');
    fireEvent.click(screen.getByTestId('wts-send-eor'));
    await waitFor(() => expect(ctx.addNotification).toHaveBeenCalledWith(expect.stringMatching(/could not be saved first/), 'error'));
    expect(screen.queryByTestId('where')).toBeNull();
  });
});
