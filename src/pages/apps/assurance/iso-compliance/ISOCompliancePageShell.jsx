import React, { Suspense, useState, useMemo } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search as SearchIcon, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import Dashboard from './Dashboard';
import Register from './Register';
import NewISO from './NewISO';
import ISODetail from './ISODetail';
import InternalAudits from './InternalAudits';
import FindingsRegister from './FindingsRegister';
import Reports from './Reports';

import { isoClausesData, isoAuditsData, isoFindingsData, isoActionsData } from '@/data/isoComplianceData';
import { useToast } from '@/hooks/use-toast';

export default function ISOCompliancePageShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentPath = location.pathname;

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddClauseModalOpen, setIsAddClauseModalOpen] = useState(false);
  const [clauses, setClauses] = useState(isoClausesData);
  const [audits] = useState(isoAuditsData);
  const [findings] = useState(isoFindingsData);
  const [actions] = useState(isoActionsData);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/iso-compliance' },
    { name: 'Clauses', path: '/dashboard/apps/assurance/iso-compliance/register' },
    { name: 'Audits', path: '/dashboard/apps/assurance/iso-compliance/audits' },
    { name: 'Findings', path: '/dashboard/apps/assurance/iso-compliance/findings' },
    { name: 'Reports', path: '/dashboard/apps/assurance/iso-compliance/reports' }
  ];

  const isFormView = currentPath.includes('/new') || (currentPath.split('/').length > 5 && !['register', 'audits', 'findings', 'reports'].some(p => currentPath.endsWith(p)));

  const handleAddClause = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newClause = {
      id: `CLAUSE-${Math.floor(Math.random() * 10000)}`,
      standard: formData.get('standard'),
      clause: formData.get('clause'),
      title: formData.get('title'),
      description: formData.get('description'),
      department: formData.get('department'),
      owner: 'Current User',
      status: 'Compliant',
      auditStatus: 'Pending',
      evidenceStatus: 'Current',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
    setClauses([newClause, ...clauses]);
    setIsAddClauseModalOpen(false);
    toast({
      title: "Clause Added",
      description: "The new ISO clause has been successfully registered.",
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--background))] overflow-hidden">
      {/* Top Application Header */}
      <div className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20 relative">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 -ml-2 transition-colors"
            onClick={() => navigate('/dashboard/assurance')}
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Assurance
          </Button>
          <div className="h-6 w-px bg-[hsl(var(--border))]"></div>
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[hsl(var(--primary))]/10 rounded-md">
               <ShieldCheck className="w-5 h-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">ISO Compliance</h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Manage and audit ISO standards</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..." 
              className="pl-9 w-64 bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
            />
            {searchQuery && (
              <X 
                className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))] cursor-pointer" 
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>
          <Button size="sm" className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 transition-colors border-0" onClick={() => setIsAddClauseModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Clause
          </Button>
        </div>
      </div>

      {/* Sticky Tab Navigation */}
      {!isFormView && (
        <div className="bg-[hsl(var(--card))]/95 backdrop-blur-md border-b border-[hsl(var(--border))] px-6 flex items-center gap-8 shrink-0 z-10">
          {navItems.map(item => {
            const isActive = currentPath === item.path || (item.path !== '/dashboard/apps/assurance/iso-compliance' && currentPath.startsWith(item.path));
            return (
              <Link 
                key={item.name} 
                to={item.path}
                className={`py-4 text-sm font-medium transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-sm
                  ${isActive 
                    ? 'text-[hsl(var(--primary))]' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/50 px-2 -mx-2'
                  }
                `}
              >
                {item.name}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))] shadow-[0_-2px_10px_rgba(var(--primary),0.5)]"></div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative bg-[hsl(var(--background))] p-6">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center h-full w-full opacity-50">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--primary))] mb-4"></div>
            <p className="text-[hsl(var(--muted-foreground))]">Loading workspace...</p>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard clauses={clauses} audits={audits} findings={findings} actions={actions} />} />
            <Route path="register" element={<Register clauses={clauses} searchQuery={searchQuery} />} />
            <Route path="new" element={<NewISO />} />
            <Route path="audits" element={<InternalAudits audits={audits} searchQuery={searchQuery} />} />
            <Route path="findings" element={<FindingsRegister findings={findings} searchQuery={searchQuery} />} />
            <Route path="reports" element={<Reports clauses={clauses} audits={audits} findings={findings} actions={actions} />} />
            <Route path=":id" element={<ISODetail />} />
            <Route path="*" element={<Dashboard clauses={clauses} audits={audits} findings={findings} actions={actions} />} />
          </Routes>
        </Suspense>
      </div>

      {/* Add Clause Modal */}
      <Dialog open={isAddClauseModalOpen} onOpenChange={setIsAddClauseModalOpen}>
        <DialogContent className="sm:max-w-[500px] bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
          <DialogHeader>
            <DialogTitle>Register New ISO Clause</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddClause} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="standard">ISO Standard</Label>
              <select name="standard" id="standard" className="w-full p-2 rounded-md bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--input-foreground))]" required>
                <option value="ISO 9001:2015">ISO 9001:2015 (Quality)</option>
                <option value="ISO 14001:2015">ISO 14001:2015 (Environment)</option>
                <option value="ISO 45001:2018">ISO 45001:2018 (OH&S)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clause">Clause Reference</Label>
                <Input name="clause" id="clause" placeholder="e.g. 7.1.5" className="bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--input-foreground))]" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input name="department" id="department" placeholder="e.g. Operations" className="bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--input-foreground))]" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input name="title" id="title" placeholder="Monitoring and measuring resources" className="bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--input-foreground))]" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description / Requirements</Label>
              <textarea name="description" id="description" className="w-full p-2 min-h-[100px] rounded-md bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--input-foreground))]" placeholder="Enter clause requirements..." required></textarea>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[hsl(var(--border))]">
              <Button type="button" variant="outline" onClick={() => setIsAddClauseModalOpen(false)} className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">Cancel</Button>
              <Button type="submit" className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">Save Clause</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}