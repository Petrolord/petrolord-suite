export const MOCK_LESSONS = [
  {
    id: 'LL-2026-001',
    title: 'Pump failure during startup sequence',
    description: 'Main export pump failed during initial commissioning due to improper alignment and insufficient lubrication.',
    category: 'Equipment Failure',
    discipline: 'Mechanical',
    project: 'Subsea Tie-back Alpha',
    status: 'Published',
    reusability: 'High',
    severity: 'High',
    author: 'John Doe',
    date: '2026-01-15',
    rootCause: 'Procedural omission'
  },
  {
    id: 'LL-2026-002',
    title: 'Optimized drill bit selection reduced NPT',
    description: 'Switching to PDC bits with customized cutter layout for the interbedded shale section reduced tripping time by 40%.',
    category: 'Optimization',
    discipline: 'Drilling',
    project: 'Well X-15 Development',
    status: 'Under Review',
    reusability: 'High',
    severity: 'Low',
    author: 'Jane Smith',
    date: '2026-02-10',
    rootCause: 'Technology adoption'
  },
  {
    id: 'LL-2026-003',
    title: 'Inadequate weather window planning for lifting',
    description: 'Topside module lifting delayed by 4 days due to unexpected swell conditions not accounted for in primary schedule.',
    category: 'Planning',
    discipline: 'Operations',
    project: 'Platform Bravo Upgrade',
    status: 'Draft',
    reusability: 'Medium',
    severity: 'Medium',
    author: 'Mike Johnson',
    date: '2026-03-05',
    rootCause: 'Inadequate forecasting'
  },
  {
    id: 'LL-2026-004',
    title: 'Corrosion inhibitor incompatibility',
    description: 'New eco-friendly inhibitor reacted with existing scale chemical causing line blockage.',
    category: 'Chemistry',
    discipline: 'Production',
    project: 'Field Charlie',
    status: 'Published',
    reusability: 'High',
    severity: 'High',
    author: 'Sarah Lee',
    date: '2025-11-20',
    rootCause: 'Lack of compatibility testing'
  },
  {
    id: 'LL-2026-005',
    title: 'Successful implementation of remote monitoring',
    description: 'Using digital twins for compressor monitoring predicted failure 2 weeks in advance.',
    category: 'Digitalization',
    discipline: 'Maintenance',
    project: 'Asset Delta',
    status: 'Published',
    reusability: 'High',
    severity: 'Low',
    author: 'Tom Wilson',
    date: '2025-12-01',
    rootCause: 'Proactive monitoring'
  }
];

export const METRICS = {
  total: 156,
  draft: 12,
  underReview: 24,
  published: 110,
  archived: 10,
  pendingAction: 5,
  highReusability: 89
};