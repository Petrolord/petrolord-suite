export const filterRecords = (records, searchTerm, statusFilter) => {
  if (!records) return [];
  
  return records.filter(record => {
    const matchesSearch = searchTerm === '' || 
      record.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.id?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'All' || record.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
};