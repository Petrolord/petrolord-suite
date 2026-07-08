import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Activity, Save, Download, Upload, Layout, Settings, Share2, ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import InputPanel from '@/components/wellcorrelation/InputPanel';
import SectionPanel from '@/components/wellcorrelation/SectionPanel';
import EmptyState from '@/components/wellcorrelation/EmptyState';
import DataExchangeHub from '@/components/DataExchangeHub';

const WellCorrelationPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [project, setProject] = useState({
    id: null,
    name: 'New Correlation Project',
    datum_depth: 0,
    datum_type: 'MSL', // MSL or KB
  });

  const [wells, setWells] = useState([]);
  const [selectedWellId, setSelectedWellId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // === 1. Unified Data Fabric Integration ===
  const handleImportData = (data) => {
    // Handle incoming data from other apps (e.g., Petrophysics Estimator or ReservoirCalc Pro)
    if (data.wells && Array.isArray(data.wells)) {
       // Merge new wells, avoiding duplicates
       setWells(prev => {
         const existingIds = new Set(prev.map(w => w.id));
         const newWells = data.wells.filter(w => !existingIds.has(w.id)).map(w => ({
             ...w,
             id: w.id || crypto.randomUUID(), // Ensure ID
             curves: w.curves || [],
             tops: w.tops || []
         }));
         return [...prev, ...newWells];
       });
       toast({ title: "Data Imported", description: `Imported ${data.wells.length} wells from shared package.` });
    } else if (data.curve_data) {
        // Single well import pattern
        const newWell = {
            id: crypto.randomUUID(),
            well_name: data.name || "Imported Well",
            curves: data.curve_data || [],
            tops: [],
            surface_x: 0,
            surface_y: 0
        };
        setWells(prev => [...prev, newWell]);
        toast({ title: "Well Imported", description: "Single well data added to correlation panel." });
    }
  };

  // === 2. Persistence Layer ===
  const handleSave = async () => {
    if (!user) {
        toast({ title: "Authentication Required", description: "Please log in to save projects.", variant: "destructive" });
        return;
    }
    setIsLoading(true);

    try {
        // A. Save Project Metadata
        const projectPayload = {
            user_id: user.id,
            project_name: project.name,
            updated_at: new Date()
        };

        let projectId = project.id;

        if (projectId) {
            const { error } = await supabase.from('well_correlation_projects').update(projectPayload).eq('id', projectId);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from('well_correlation_projects').insert([projectPayload]).select().single();
            if (error) throw error;
            projectId = data.id;
            setProject(prev => ({ ...prev, id: projectId }));
        }

        // B. Save Wells (Batch Upsert strategy)
        if (wells.length > 0) {
            const wellsPayload = wells.map(well => ({
                project_id: projectId,
                user_id: user.id,
                well_name: well.well_name,
                surface_x: well.surface_x,
                surface_y: well.surface_y,
                datum: project.datum_depth, // Simplify for now
                curve_map: {}, // Placeholder for complex mapping
                curves: [], // Don't save heavy raw logs in this simplified view if unnecessary, or save condensed
                log_data: { curves: well.curves }, // Store actual log data in JSONB
                tops: { data: well.tops },
                created_at: new Date() // upsert will ignore this on update usually, but good for insert
            }));

            // We first delete existing wells for this project to handle removals (simplest strategy for this scope)
            // In a real enterprise app, we'd diff changes.
            await supabase.from('well_correlation_wells').delete().eq('project_id', projectId);
            
            const { error: wellsError } = await supabase.from('well_correlation_wells').insert(wellsPayload);
            if (wellsError) throw wellsError;
        }

        toast({ title: "Project Saved", description: "Correlation project and wells saved successfully." });

    } catch (error) {
        console.error("Save Error:", error);
        toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* === Header === */}
      <header className="flex flex-col md:flex-row justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/geoscience')} className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-rose-400 to-red-500 bg-clip-text text-transparent flex items-center gap-2">
                    <Layout className="w-6 h-6 text-rose-500" />
                    Well Correlation Panel
                </h1>
                <p className="text-xs text-slate-400">Stratigraphic Interpretation & Log Correlation</p>
            </div>
        </div>

        <div className="flex items-center gap-2">
             <DataExchangeHub 
                mode="import" 
                onImport={handleImportData} 
                categoryFilter="WELL_LOGS"
            />
             <DataExchangeHub 
                mode="export" 
                currentData={{ wells: wells, project_meta: project }} 
                currentAppName="Well Correlation Panel" 
                exportName={project.name}
                categoryFilter="CORRELATION_PROJECT"
            />
            <Button variant="outline" onClick={handleSave} disabled={isLoading} className="border-slate-700 hover:bg-slate-800">
                <Save className="w-4 h-4 mr-2" />
                {isLoading ? "Saving..." : "Save Project"}
            </Button>
        </div>
      </header>

      {/* === Main Content === */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Inputs) */}
        <div className="w-80 bg-slate-900 border-r border-slate-800 flex-shrink-0 overflow-y-auto hidden lg:block">
            <InputPanel 
                project={project} 
                setProject={setProject} 
                wells={wells} 
                setWells={setWells}
                selectedWellId={selectedWellId}
                setSelectedWellId={setSelectedWellId}
            />
        </div>

        {/* Main Canvas (Section View) */}
        <div className="flex-1 bg-slate-950 relative overflow-hidden flex flex-col">
            {wells.length === 0 ? (
                <EmptyState onAddWell={() => document.getElementById('add-well-btn')?.click()} />
            ) : (
                <SectionPanel 
                    wells={wells} 
                    setWells={setWells}
                    project={project}
                />
            )}
        </div>
      </div>
    </div>
  );
};

export default WellCorrelationPanel;