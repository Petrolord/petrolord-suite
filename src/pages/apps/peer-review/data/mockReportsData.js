export const getMockReportData = (reportId) => {
  const generateId = (prefix, index) => `${prefix}-${1000 + index}`;
  const dates = ['2026-03-01', '2026-03-10', '2026-03-15', '2026-03-20', '2026-03-25'];
  const disciplines = ['Geoscience', 'Reservoir', 'Drilling', 'Completion', 'Facilities', 'Economics'];
  const projects = ['Alpha Deep', 'Bravo Shallow', 'Charlie Tie-back', 'Delta Platform', 'Echo Subsea'];

  switch(reportId) {
    case 1: // Comments by Status
      return Array.from({length: 45}).map((_, i) => ({
        Comment_ID: generateId('CMT', i),
        Review_Code: generateId('REV', i % 10),
        Author: `Reviewer ${i % 5 + 1}`,
        Discipline: disciplines[i % disciplines.length],
        Status: i % 3 === 0 ? 'Open' : (i % 3 === 1 ? 'Responded' : 'Closed'),
        Created_Date: dates[i % dates.length],
      }));
    case 2: // Comments by Severity
      return Array.from({length: 30}).map((_, i) => ({
        Comment_ID: generateId('CMT', i),
        Review_Code: generateId('REV', i % 8),
        Severity: i % 10 === 0 ? 'Critical' : (i % 4 === 0 ? 'Major' : 'Minor'),
        Status: i % 2 === 0 ? 'Open' : 'Closed',
        Target_Discipline: disciplines[i % disciplines.length],
        Summary: 'Technical clarification required regarding assumptions.',
      }));
    case 3: // Comments by Discipline
      return disciplines.map((d, i) => ({
        Discipline: d,
        Total_Comments: Math.floor(Math.random() * 50) + 10,
        Open: Math.floor(Math.random() * 20),
        Closed: Math.floor(Math.random() * 30),
        Critical: Math.floor(Math.random() * 5),
      }));
    case 4: // Review Cycle Duration
      return Array.from({length: 15}).map((_, i) => ({
        Review_Code: generateId('REV', i),
        Title: `Phase ${i % 3 + 1} Review - ${projects[i % projects.length]}`,
        Draft_Days: Math.floor(Math.random() * 10) + 2,
        Review_Days: Math.floor(Math.random() * 15) + 5,
        Verification_Days: Math.floor(Math.random() * 8) + 1,
        Total_Days: Math.floor(Math.random() * 30) + 10,
        Status: i % 4 === 0 ? 'In Progress' : 'Completed'
      }));
    case 5: // Reviews by Project
      return projects.map((p, i) => ({
        Project_Asset: p,
        Active_Reviews: Math.floor(Math.random() * 5),
        Completed_Reviews: Math.floor(Math.random() * 10) + 2,
        Total_Comments_Generated: Math.floor(Math.random() * 100) + 20,
        Open_Critical_Items: Math.floor(Math.random() * 3),
      }));
    case 7: // Reviewer Workload
      return Array.from({length: 8}).map((_, i) => ({
        Reviewer_Name: `Technical Auth ${i + 1}`,
        Discipline: disciplines[i % disciplines.length],
        Active_Assignments: Math.floor(Math.random() * 5) + 1,
        Pending_Comments: Math.floor(Math.random() * 15),
        Overdue_Tasks: Math.floor(Math.random() * 3),
      }));
    case 8: // Overdue Reviews
      return Array.from({length: 5}).map((_, i) => ({
        Review_Code: generateId('REV', i + 50),
        Project: projects[i % projects.length],
        Stage: 'In Review',
        Due_Date: '2026-03-01',
        Days_Overdue: Math.floor(Math.random() * 20) + 5,
        Coordinator: `Coordinator ${i % 3 + 1}`,
      }));
    default:
      // Generic fallback for other reports
      return Array.from({length: 20}).map((_, i) => ({
        ID: generateId('REC', i),
        Category: disciplines[i % disciplines.length],
        Metric_Value: Math.floor(Math.random() * 100),
        Date_Logged: dates[i % dates.length],
        Status: i % 2 === 0 ? 'Active' : 'Resolved'
      }));
  }
};