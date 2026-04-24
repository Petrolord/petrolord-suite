import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter, Download, Plus, MoreVertical, Trash2, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compliancePermissionsService } from './services/compliancePermissionsService';
import { complianceRecordsService } from './services/complianceRecordsService';
import { StatusBadge } from './components/SharedComponents';
import { format } from 'date-fns';

export default function Register() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const perm = await compliancePermissionsService.checkAccess();
    if (perm.hasAccess && perm.orgId) {
      setOrgId(perm.orgId);
      try {
        const data = await complianceRecordsService.getRecords(perm.orgId);
        setRecords(data);
      } catch (err) {
        toast({ title: "Error", description: "Failed to fetch register data.", variant: "destructive" });
      }
    }
    setLoading(false);
  }

  const handleDelete = async (id) => {
    try {
      await complianceRecordsService.deleteRecord(id);
      toast({ description: "Record deleted successfully." });
      loadData();
    } catch (err) {
      toast({ title: "Error", description: "Could not delete record.", variant: "destructive" });
    }
  };

  const filtered = records.filter(item => 
    (item.title || '').toLowerCase().includes(search.toLowerCase()) || 
    (item.facility || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = () => {
    toast({
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
    });
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 pb-24 bg-[hsl(var(--background))]">
      {/* Toolbar */}
      <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col sm:flex-row gap-4 justify-between items-center sticky top-0 z-10">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input 
            placeholder="Search obligations, facilities..." 
            className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--warning))] text-[hsl(var(--foreground))]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Filter className="w-4 h-4 mr-2" /> Filters
          </Button>
          <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0" onClick={handleAction}>
            <Plus className="w-4 h-4 mr-2" /> Add Record
          </Button>
        </div>
      </div>

      {/* Data Grid */}
      <div className="p-6 flex-1 overflow-auto">
        <div className="data-grid-container shadow-sm">
          <table className="data-grid-table w-full">
            <thead>
              <tr>
                <th className="data-grid-th w-10 text-center"><input type="checkbox" className="rounded border-[hsl(var(--border))] bg-transparent" /></th>
                <th className="data-grid-th">Title</th>
                <th className="data-grid-th">Authority</th>
                <th className="data-grid-th">Facility</th>
                <th className="data-grid-th">Due Date</th>
                <th className="data-grid-th">Status</th>
                <th className="data-grid-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[hsl(var(--muted-foreground))]">Loading records...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]">
                    No obligations found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="data-grid-tr group border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/30">
                    <td className="data-grid-td text-center">
                      <input type="checkbox" className="rounded border-[hsl(var(--border))] bg-transparent" />
                    </td>
                    <td className="data-grid-td font-semibold text-[hsl(var(--foreground))] cursor-pointer hover:text-[hsl(var(--warning))]" onClick={handleAction}>{item.title}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{item.authority?.acronym || item.authority?.name || '-'}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{item.facility || '-'}</td>
                    <td className="data-grid-td text-[hsl(var(--foreground))]">{item.due_date ? format(new Date(item.due_date), 'MMM d, yyyy') : '-'}</td>
                    <td className="data-grid-td"><StatusBadge status={item.status} /></td>
                    <td className="data-grid-td text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" onClick={handleAction}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}