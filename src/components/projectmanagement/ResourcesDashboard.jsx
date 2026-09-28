import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3, ClipboardList, PlusCircle } from 'lucide-react';
import ResourceList from './ResourceList';
import ResourceForm from './ResourceForm';
import CapacityDashboard from './CapacityDashboard';
import ResourceAssignment from './ResourceAssignment'; // Used internally or as needed
import { supabase } from '@/lib/customSupabaseClient';

const ResourcesDashboard = ({ project, onDataChange }) => {
  const [activeTab, setActiveTab] = useState('pool');
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tasks, setTasks] = useState([]);

  const fetchData = async () => {
      if(!project) return;
      const { data: resData } = await supabase.from('pm_resources').select('*').eq('project_id', project.id).order('name');
      const { data: assignData } = await supabase.from('pm_resource_assignments').select('*');
      // Filter assignments to only show those related to this project's tasks?
      // Actually, for capacity planning, we might want to know about assignments across ALL projects for these resources if they are shared.
      // But for MVP, let's stick to this project's scope or assume 'pm_resources' are project specific.
      // If 'pm_resources' has project_id, they are specific. 
      
      setResources(resData || []);
      setAssignments(assignData || []);
      
      // Also need tasks to map assignments to dates if not stored in assignment
      const { data: taskData } = await supabase.from('tasks').select('*').eq('project_id', project.id);
      setTasks(taskData || []);
  };

  useEffect(() => {
      fetchData();
  }, [project]);

  const handleEdit = (resource) => {
      setEditingResource(resource);
      setFormOpen(true);
  };

  const handleAddNew = () => {
      setEditingResource(null);
      setFormOpen(true);
  };

  const handleSaved = () => {
      fetchData();
      onDataChange();
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-bold text-pl-text">Resource Management</h2>
        <div className="flex gap-2">
            <Button onClick={handleAddNew}>
                <PlusCircle className="w-4 h-4 mr-2" /> Add Resource
            </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="self-start">
            <TabsTrigger value="pool"><Users className="w-4 h-4 mr-2" /> Resource Pool</TabsTrigger>
            <TabsTrigger value="capacity"><BarChart3 className="w-4 h-4 mr-2" /> Capacity & Planning</TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 bg-pl-surface border border-pl-border rounded-lg overflow-hidden p-4">
            <TabsContent value="pool" className="h-full m-0">
                <ResourceList resources={resources} onEdit={handleEdit} />
            </TabsContent>

            <TabsContent value="capacity" className="h-full m-0 overflow-y-auto">
                <CapacityDashboard resources={resources} assignments={assignments} tasks={tasks} />
            </TabsContent>
        </div>
      </Tabs>

      <ResourceForm 
        open={isFormOpen} 
        onOpenChange={setFormOpen} 
        project={project} 
        existingResource={editingResource} 
        onSaved={handleSaved} 
      />
    </div>
  );
};

export default ResourcesDashboard;