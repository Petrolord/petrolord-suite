import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, Edit, Mail, Phone, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compliancePermissionsService } from './services/compliancePermissionsService';
import { complianceRegulatorsService } from './services/complianceRegulatorsService';

export default function Directory() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [regulators, setRegulators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const perm = await compliancePermissionsService.checkAccess();
    if (perm.hasAccess && perm.orgId) {
      try {
        const data = await complianceRegulatorsService.getRegulators(perm.orgId);
        setRegulators(data);
      } catch (err) {
        toast({ title: "Error", description: "Failed to fetch directory data.", variant: "destructive" });
      }
    }
    setLoading(false);
  }

  const handleDelete = async (id) => {
    try {
      await complianceRegulatorsService.deleteRegulator(id);
      toast({ description: "Regulator deleted successfully." });
      loadData();
    } catch (err) {
      toast({ title: "Error", description: "Could not delete regulator.", variant: "destructive" });
    }
  };

  const filtered = regulators.filter(item => 
    (item.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (item.acronym || '').toLowerCase().includes(search.toLowerCase())
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
            placeholder="Search regulators, agencies..." 
            className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))] focus-visible:ring-[hsl(var(--warning))] text-[hsl(var(--foreground))]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0" onClick={handleAction}>
            <Plus className="w-4 h-4 mr-2" /> Add Regulator
          </Button>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="p-6 flex-1 overflow-auto">
        {loading ? (
           <div className="flex justify-center p-12">
             <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--warning))]"></div>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((regulator) => (
              <Card key={regulator.id} className="panel-elevation hover:border-[hsl(var(--warning))]/50 transition-colors group">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--warning))] transition-colors">{regulator.acronym || 'Agency'}</h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] line-clamp-1" title={regulator.name}>{regulator.name}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity -mt-2 -mr-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" onClick={handleAction}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]" onClick={() => handleDelete(regulator.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center text-[hsl(var(--muted-foreground))]">
                      <span className="inline-block w-24">Jurisdiction:</span>
                      <span className="text-[hsl(var(--foreground))]">{regulator.jurisdiction || 'N/A'}</span>
                    </div>
                    <div className="flex items-center text-[hsl(var(--muted-foreground))]">
                      <span className="inline-block w-24">Contact:</span>
                      <span className="text-[hsl(var(--foreground))]">{regulator.contact_name || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6 pt-4 border-t border-[hsl(var(--border))]">
                    <Button variant="outline" size="sm" className="flex-1 bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => regulator.email ? window.open(`mailto:${regulator.email}`) : handleAction()}>
                      <Mail className="w-4 h-4 mr-2" /> Email
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => regulator.phone ? window.open(`tel:${regulator.phone}`) : handleAction()}>
                      <Phone className="w-4 h-4 mr-2" /> Call
                    </Button>
                    <Button variant="outline" size="icon" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handleAction}>
                      <ExternalLink className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-[hsl(var(--muted-foreground))] border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]/50">
                No regulators found matching "{search}".
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}