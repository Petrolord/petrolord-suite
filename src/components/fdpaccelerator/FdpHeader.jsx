import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Save } from 'lucide-react';

const FdpHeader = ({ navigate, handleSaveProject, saving, projectId }) => {
  return (
    <header className="flex-shrink-0 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-2 rounded-lg">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold">FDP Accelerator</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveProject} disabled={saving} className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div> : <Save className="w-4 h-4 mr-2" />}
            {projectId ? 'Update Project' : 'Save Project'}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default FdpHeader;