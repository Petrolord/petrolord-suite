// Mock data generation for ISO Compliance Tool

export const isoClausesData = Array.from({ length: 30 }).map((_, i) => ({
  id: `CLAUSE-${1000 + i}`,
  standard: i % 3 === 0 ? 'ISO 14001:2015' : i % 2 === 0 ? 'ISO 45001:2018' : 'ISO 9001:2015',
  clause: `${Math.floor(i / 5) + 4}.${(i % 5) + 1}`,
  title: `Clause Title ${i + 1}`,
  description: `Detailed description for clause ${i + 1}. Requires documented information and regular monitoring.`,
  department: i % 4 === 0 ? 'Operations' : i % 3 === 0 ? 'HSE' : 'Quality',
  owner: `User ${i % 10 + 1}`,
  status: i % 5 === 0 ? 'Non-Compliant' : i % 4 === 0 ? 'Partial' : 'Compliant',
  auditStatus: i % 6 === 0 ? 'Overdue' : i % 3 === 0 ? 'Pending' : 'Audited',
  evidenceStatus: i % 5 === 0 ? 'Missing' : i % 2 === 0 ? 'Needs Update' : 'Current',
  lastUpdated: new Date(Date.now() - Math.random() * 10000000000).toISOString().split('T')[0],
}));

export const isoAuditsData = Array.from({ length: 15 }).map((_, i) => ({
  id: `AUDIT-${202300 + i}`,
  standard: i % 2 === 0 ? 'ISO 9001:2015' : 'ISO 14001:2015',
  title: `${i % 2 === 0 ? 'Quality' : 'Environmental'} Internal Audit Q${(i % 4) + 1}`,
  department: i % 3 === 0 ? 'Operations' : 'Corporate',
  leadAuditor: `Auditor ${i % 5 + 1}`,
  date: new Date(Date.now() - Math.random() * 5000000000).toISOString().split('T')[0],
  status: i === 0 ? 'In Progress' : i % 4 === 0 ? 'Planned' : 'Completed',
  findingsCount: Math.floor(Math.random() * 5),
  score: Math.floor(Math.random() * 20) + 80,
}));

export const isoFindingsData = Array.from({ length: 20 }).map((_, i) => ({
  id: `FIND-${500 + i}`,
  auditId: `AUDIT-${202300 + (i % 15)}`,
  clauseId: `CLAUSE-${1000 + (i % 30)}`,
  type: i % 5 === 0 ? 'Major NC' : i % 3 === 0 ? 'Minor NC' : 'Observation',
  severity: i % 5 === 0 ? 'High' : i % 3 === 0 ? 'Medium' : 'Low',
  description: `Finding description ${i + 1}. Process not fully aligned with documented procedure.`,
  status: i % 4 === 0 ? 'Open' : i % 3 === 0 ? 'In Review' : 'Closed',
  dueDate: new Date(Date.now() + Math.random() * 5000000000).toISOString().split('T')[0],
  owner: `User ${i % 8 + 1}`,
}));

export const isoActionsData = Array.from({ length: 15 }).map((_, i) => ({
  id: `ACT-${800 + i}`,
  findingId: `FIND-${500 + (i % 20)}`,
  description: `Corrective action ${i + 1} to address root cause and update documentation.`,
  owner: `User ${i % 6 + 1}`,
  dueDate: new Date(Date.now() + Math.random() * 4000000000).toISOString().split('T')[0],
  status: i % 3 === 0 ? 'In Progress' : i % 4 === 0 ? 'Overdue' : 'Completed',
}));