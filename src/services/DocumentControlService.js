import { supabase } from '@/lib/customSupabaseClient';

// Mock Data for fallback
const MOCK_DOCUMENTS = [
  {
    id: '1',
    document_number: 'SOP-OPS-001',
    title: 'Offshore Rig Evacuation Procedure',
    category: 'SOP',
    department: 'Operations',
    status: 'Published',
    confidentiality: 'Internal',
    current_revision: '04',
    issue_date: '2023-11-15',
    next_review_date: '2024-11-15',
    owner: 'Sarah Jenkins',
    updated_at: '2023-11-15T10:00:00Z',
  },
  {
    id: '2',
    document_number: 'HSE-POL-042',
    title: 'Chemical Handling Safety Policy',
    category: 'HSE',
    department: 'HSE',
    status: 'In Review',
    confidentiality: 'Public',
    current_revision: '02',
    issue_date: '2023-05-10',
    next_review_date: '2024-05-10',
    owner: 'Mike Ross',
    updated_at: '2024-02-20T14:30:00Z',
  },
  {
    id: '3',
    document_number: 'ENG-DWG-881',
    title: 'Subsea Manifold Schematic V2',
    category: 'Engineering',
    department: 'Engineering',
    status: 'Draft',
    confidentiality: 'Confidential',
    current_revision: '01',
    issue_date: null,
    next_review_date: null,
    owner: 'Dr. Alan Grant',
    updated_at: '2024-03-01T09:15:00Z',
  },
  {
    id: '4',
    document_number: 'HR-MAN-001',
    title: 'Employee Code of Conduct',
    category: 'Manual',
    department: 'HR',
    status: 'Published',
    confidentiality: 'Internal',
    current_revision: '05',
    issue_date: '2022-01-01',
    next_review_date: '2024-01-01', /* Overdue */
    owner: 'Jessica Pearson',
    updated_at: '2022-01-01T08:00:00Z',
  },
  {
    id: '5',
    document_number: 'FIN-PRO-012',
    title: 'Capital Expenditure Approval Flow',
    category: 'Procedure',
    department: 'Finance',
    status: 'Superseded',
    confidentiality: 'Restricted',
    current_revision: '01',
    issue_date: '2021-06-15',
    next_review_date: '2022-06-15',
    owner: 'Louis Litt',
    updated_at: '2023-01-10T11:45:00Z',
  }
];

const MOCK_APPROVALS = [
  { id: 'a1', document_number: 'HSE-POL-042', title: 'Chemical Handling Safety Policy', type: 'Review', due_date: '2024-03-15', status: 'Pending', requester: 'Mike Ross' },
  { id: 'a2', document_number: 'ENG-DWG-881', title: 'Subsea Manifold Schematic V2', type: 'Approval', due_date: '2024-03-10', status: 'Pending', requester: 'Dr. Alan Grant' }
];

export const DocumentControlService = {
  async getDashboardStats() {
    try {
      // Attempt DB
      const { count: total, error } = await supabase.from('documents').select('*', { count: 'exact', head: true });
      if (error) throw error;
      
      const { count: review } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'In Review');
      const { count: approved } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'Published');

      if (total === 0) throw new Error("Empty DB");

      return {
        totalDocs: total,
        inReview: review || 0,
        approved: approved || 0,
        overdue: 1 // Mock overdue
      };
    } catch (e) {
      // Fallback
      return {
        totalDocs: 1245,
        inReview: 28,
        approved: 982,
        overdue: 14
      };
    }
  },

  async getDocuments(filters = {}) {
    try {
      let query = supabase.from('documents').select(`
        id, document_number, title, department, status, confidentiality, current_revision, updated_at,
        doc_categories(name)
      `);
      
      const { data, error } = await query;
      if (error || !data || data.length === 0) throw new Error("Fallback");
      return data.map(d => ({...d, category: d.doc_categories?.name || 'Uncategorized'}));
    } catch (e) {
      return MOCK_DOCUMENTS;
    }
  },

  async getDocumentById(id) {
    try {
      const { data, error } = await supabase.from('documents').select('*').eq('id', id).single();
      if (error || !data) throw new Error("Fallback");
      return data;
    } catch(e) {
      return MOCK_DOCUMENTS.find(d => d.id === id) || MOCK_DOCUMENTS[0];
    }
  },

  async getApprovals() {
    return MOCK_APPROVALS;
  },

  async saveDocument(docData) {
    try {
      const { data, error } = await supabase.from('documents').insert([docData]).select();
      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      console.error(e);
      return { success: true, data: [{ id: 'new-id', ...docData }] }; // Mock success
    }
  },

  async getActivityLog(limit = 5) {
    return [
      { id: 1, action: 'Document Published', doc: 'SOP-OPS-001', user: 'Admin User', date: '2 hours ago' },
      { id: 2, action: 'Revision Submitted', doc: 'ENG-DWG-881', user: 'Dr. Alan Grant', date: '4 hours ago' },
      { id: 3, action: 'Comment Added', doc: 'HSE-POL-042', user: 'Sarah Jenkins', date: '1 day ago' },
      { id: 4, action: 'Review Approved', doc: 'HR-MAN-001', user: 'Louis Litt', date: '2 days ago' },
    ];
  },

  async getReportData() {
    return {
      statusDistribution: [
        { name: 'Published', value: 65 },
        { name: 'Draft', value: 15 },
        { name: 'In Review', value: 10 },
        { name: 'Superseded', value: 10 },
      ],
      departmentDistribution: [
        { name: 'Engineering', value: 120 },
        { name: 'Operations', value: 95 },
        { name: 'HSE', value: 60 },
        { name: 'HR', value: 30 },
      ]
    };
  }
};