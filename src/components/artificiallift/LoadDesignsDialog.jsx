import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Trash2, Download, Loader2 } from 'lucide-react';

const LoadDesignsDialog = ({ isOpen, onOpenChange, onLoad }) => {
  const [designs, setDesigns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchDesigns();
    }
  }, [isOpen]);

  const fetchDesigns = async () => {
    setIsLoading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { data, error } = await supabase
        .from('artificial_lift_designs')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDesigns(data || []);
    } catch (err) {
      console.error('Error fetching designs:', err);
      toast({
        variant: "destructive",
        title: "Fetch Failed",
        description: "Could not load saved designs. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this design?")) return;

    try {
      const { error } = await supabase
        .from('artificial_lift_designs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Design deleted successfully.",
      });
      setDesigns(designs.filter(d => d.id !== id));
    } catch (err) {
      console.error('Error deleting design:', err);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not delete the design.",
      });
    }
  };

  const handleLoadClick = (design) => {
    onLoad(design.design_data, design.design_name);
    toast({
      title: "Loaded",
      description: `Design "${design.design_name}" loaded successfully!`,
      className: "bg-blue-600 text-white border-none",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-700 text-slate-100 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Load Saved Design</DialogTitle>
          <DialogDescription className="text-slate-400">
            Select a previously saved artificial lift design configuration to continue working.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-lime-400" />
            </div>
          ) : designs.length === 0 ? (
            <div className="text-center p-8 text-slate-400">
              No saved designs found.
            </div>
          ) : (
            designs.map((design) => (
              <div key={design.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-white truncate" title={design.design_name}>{design.design_name}</h4>
                  {design.design_description && (
                    <p className="text-sm text-slate-400 truncate mt-1" title={design.design_description}>
                      {design.design_description}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Updated: {new Date(design.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleLoadClick(design)}
                    className="border-lime-500/30 text-lime-400 hover:bg-lime-500/20"
                  >
                    <Download className="w-4 h-4 mr-2" /> Load
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDelete(design.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoadDesignsDialog;