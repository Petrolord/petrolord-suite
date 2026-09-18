/**
 * AS13, defect 1 (BLOCKING): no audit could ever be reported.
 *
 * AS10 computed the report gate from the SAVED audit. The gate asks for
 * the conclusion, and the conclusion is only saved by "Issue the
 * report", which that gate disabled. This renders the page with a fully
 * answered audit and proves a typed conclusion enables the button and
 * issues the report.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { canAdvanceAudit } from '@/lib/auditManagement';
import { auditAsItWouldBeSaved } from '../utils/auditPayload';
import AuditDetail from '../AuditDetail';

const mockAdvance = jest.fn(async () => ({ success: true }));
const mockUpdate = jest.fn(async () => ({ success: true }));

const audit = {
  id: 'a1', audit_code: 'AUD-2026-004', title: 'Rig 7 contractor audit', status: 'Fieldwork complete',
  template_id: 't1', lead_auditor_name: 'Ann Auditor', conclusion: null,
};
const items = [
  { id: 'i1', template_id: 't1', item_no: '1.1', question: 'Permit displayed?', criticality: 'Critical' },
  { id: 'i2', template_id: 't1', item_no: '1.2', question: 'Toolbox talk held?', criticality: 'Minor' },
];
const responses = [
  { id: 'r1', audit_id: 'a1', item_id: 'i1', result: 'Conformant', examined_on: '2026-09-10' },
  { id: 'r2', audit_id: 'a1', item_id: 'i2', result: 'Not applicable', note: 'No crew change', examined_on: '2026-09-10' },
];

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../hooks/useAuditManagement', () => ({
  useAuditManagement: () => ({
    audits: [audit],
    programmes: [],
    templates: [{ id: 't1', code: 'CL-1', title: 'Contractor' }],
    itemsFor: () => items,
    responsesFor: () => responses,
    findingsForAudit: () => [],
    findingsForResponse: () => [],
    activityFor: () => [],
    loading: false,
    error: null,
    refresh: jest.fn(),
    hasAs10Schema: true,
    openChecklist: jest.fn(),
    recordAnswer: jest.fn(),
    advanceAudit: (...args) => mockAdvance(...args),
    updateAudit: (...args) => mockUpdate(...args),
    createFinding: jest.fn(),
  }),
}));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/dashboard/apps/assurance/audit-manager/audits/a1']}>
    <Routes>
      <Route path="/dashboard/apps/assurance/audit-manager/audits/:auditId" element={<AuditDetail />} />
    </Routes>
  </MemoryRouter>,
);

describe('reporting an audit (AS13 defect 1)', () => {
  it('the gate on the saved audit alone refuses, which is the AS10 defect', () => {
    const saved = canAdvanceAudit(audit, 'Reported', { items, responses, findings: [] });
    expect(saved.ok).toBe(false);
    expect(saved.reason).toMatch(/conclusion/);
  });

  it('the gate on the audit as it would be saved passes once a conclusion is typed', () => {
    const draft = auditAsItWouldBeSaved(audit, { conclusion: 'Controls in place.', report_issued_date: '2026-09-18' });
    expect(canAdvanceAudit(draft, 'Reported', { items, responses, findings: [] })).toEqual({ ok: true });
  });

  it('a fully answered audit with a typed conclusion can be issued from the page', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Reported' }));
    const issue = screen.getByRole('button', { name: 'Issue the report' });
    expect(issue).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Audit conclusion'),
      { target: { value: 'Permit controls are in place and working.' } });
    expect(issue).toBeEnabled();

    fireEvent.click(issue);
    await waitFor(() => expect(mockAdvance).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][1].conclusion).toBe('Permit controls are in place and working.');
    const [sent, to] = mockAdvance.mock.calls[0];
    expect(to).toBe('Reported');
    expect(sent.conclusion).toBe('Permit controls are in place and working.');
  });
});
