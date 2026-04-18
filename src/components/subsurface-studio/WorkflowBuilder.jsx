import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Handle,
  Position,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Play, Trash2, Workflow, FilePlus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const initialNodes = [
  { id: 'start', type: 'input', data: { label: 'Start' }, position: { x: 250, y: 5 } },
];

const availableActions = [
  { type: 'loadAsset', label: 'Load Asset' },
  { type: 'runCalculation', label: 'Run Calculation' },
  { type: 'generateGrid', label: 'Generate Grid' },
  { type: 'exportMap', label: 'Export Map' },
];

const CustomNode = ({ data }) => {
  return (
    <div className="p-3 border border-slate-300 rounded-md bg-white text-slate-800 shadow-md min-w-[150px]">
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="font-bold text-center">{data.label}</div>
      {data.assetName && <div className="text-xs text-blue-600 mt-1">Asset: {data.assetName}</div>}
      {data.calculation && <div className="text-xs text-purple-600 mt-1">Calc: {data.calculation}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500" />
    </div>
  );
};

const nodeTypes = { custom: CustomNode, input: CustomNode };

const WorkflowBuilder = ({ projectId, allAssets }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [isPropertiesModalOpen, setPropertiesModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const reactFlowWrapper = useRef(null);
  const { toast } = useToast();
  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    if (!projectId || projectId === 'local-project') {
      setSavedWorkflows([]);
      return;
    }
    const fetchWorkflows = async () => {
      const { data, error } = await supabase
        .from('ss_workflows')
        .select('*')
        .eq('project_id', projectId);
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to fetch workflows', description: error.message });
      } else {
        setSavedWorkflows(data || []);
      }
    };
    fetchWorkflows();
  }, [projectId, toast]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/label');

      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `${type}-${+new Date()}`,
        type: 'custom',
        position,
        data: { label: `${label}`, type: type },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDragStart = (event, nodeType, label) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onNodeClick = (event, node) => {
    if (node.id === 'start') return;
    setSelectedNode(node);
    setPropertiesModalOpen(true);
  };

  const handleSaveNodeProperties = (properties) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          node.data = { ...node.data, ...properties };
        }
        return node;
      })
    );
    setPropertiesModalOpen(false);
    setSelectedNode(null);
  };

  const saveWorkflow = async () => {
    if (!projectId || projectId === 'local-project') {
      toast({ variant: 'destructive', title: 'Cannot save workflow', description: 'Please select a cloud project.' });
      return;
    }
    const payload = { nodes, edges };
    if (activeWorkflow) {
      const { data, error } = await supabase
        .from('ss_workflows')
        .update({ name: workflowName, payload, updated_at: new Date().toISOString() })
        .eq('id', activeWorkflow.id)
        .select();
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to update workflow', description: error.message });
      } else {
        toast({ title: 'Workflow Updated', description: `Workflow "${workflowName}" has been updated.` });
        setSavedWorkflows(savedWorkflows.map(wf => wf.id === data[0].id ? data[0] : wf));
      }
    } else {
      const { data, error } = await supabase
        .from('ss_workflows')
        .insert({ project_id: projectId, name: workflowName, payload })
        .select();
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to save workflow', description: error.message });
      } else {
        toast({ title: 'Workflow Saved', description: `Workflow "${workflowName}" has been saved.` });
        const newWorkflow = data[0];
        setSavedWorkflows([...savedWorkflows, newWorkflow]);
        setActiveWorkflow(newWorkflow);
      }
    }
  };

  const runWorkflow = async () => {
    if (!activeWorkflow) {
      toast({ variant: 'destructive', title: 'No active workflow', description: 'Please save or load a workflow to run it.' });
      return;
    }
    const { data, error } = await supabase.from('ss_workflow_runs').insert({ workflow_id: activeWorkflow.id, status: 'running' }).select().single();
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to start workflow run', description: error.message });
    } else {
      toast({ title: 'Workflow Started', description: `🚧 Feature not fully implemented. This is a mock run. Run ID: ${data.id}` });
    }
  };

  const loadWorkflow = (workflow) => {
    setActiveWorkflow(workflow);
    setWorkflowName(workflow.name);
    setNodes(workflow.payload.nodes || initialNodes);
    setEdges(workflow.payload.edges || []);
    toast({ title: 'Workflow Loaded', description: `Workflow "${workflow.name}" is now active.` });
  };

  const deleteWorkflow = async (workflowId) => {
    const { error } = await supabase.from('ss_workflows').delete().eq('id', workflowId);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to delete workflow', description: error.message });
    } else {
      toast({ title: 'Workflow Deleted', variant: 'destructive' });
      if (activeWorkflow?.id === workflowId) {
        createNewWorkflow();
      }
      setSavedWorkflows(savedWorkflows.filter(wf => wf.id !== workflowId));
    }
  };

  const createNewWorkflow = () => {
    setActiveWorkflow(null);
    setWorkflowName('New Workflow');
    setNodes(initialNodes);
    setEdges([]);
  };

  return (
    <div className="h-full w-full flex bg-slate-100 text-slate-900 theme-light">
      <div className="w-72 p-4 border-r border-slate-300 flex flex-col space-y-4 bg-slate-200">
        <h3 className="text-lg font-bold flex items-center text-slate-800"><Workflow className="w-5 h-5 mr-2" />Actions</h3>
        <div className="space-y-2">
          {availableActions.map((action) => (
            <div
              key={action.type}
              className="p-3 border border-slate-300 rounded-md cursor-grab bg-white hover:bg-slate-50 text-slate-800"
              onDragStart={(event) => onDragStart(event, action.type, action.label)}
              draggable
            >
              {action.label}
            </div>
          ))}
        </div>
        <div className="flex-grow flex flex-col min-h-0 pt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800">Saved Workflows</h3>
            <Button variant="ghost" size="icon" onClick={createNewWorkflow} className="h-8 w-8 text-slate-800 hover:bg-slate-300">
              <FilePlus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-grow mt-2 -mr-4 pr-4">
            <div className="space-y-2">
              {savedWorkflows.map((wf) => (
                <div key={wf.id} className={`p-2 border border-slate-300 rounded-md flex justify-between items-center bg-white ${activeWorkflow?.id === wf.id ? 'ring-2 ring-blue-500' : ''}`}>
                  <button onClick={() => loadWorkflow(wf)} className="text-left hover:text-blue-600 flex-grow truncate pr-2 text-slate-800">
                    {wf.name}
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-slate-100 hover:text-red-600" onClick={() => deleteWorkflow(wf.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
      <div className="flex-grow flex flex-col">
        <div className="p-2 border-b border-slate-300 flex items-center space-x-4 bg-slate-200">
          <Input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="Workflow Name"
            className="bg-white border-slate-300 w-1/3 text-slate-800"
          />
          <Button onClick={saveWorkflow} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <Save className="w-4 h-4 mr-2" />
            {activeWorkflow ? 'Update' : 'Save'}
          </Button>
          <Button onClick={runWorkflow} className="bg-lime-600 hover:bg-lime-700 text-white font-bold" disabled={!activeWorkflow}>
            <Play className="w-4 h-4 mr-2" />
            Run
          </Button>
        </div>
        <div className="flex-grow" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-50"
          >
            <Controls />
            <Background color="#ccc" gap={16} />
          </ReactFlow>
        </div>
      </div>
      {selectedNode && (
        <PropertiesDialog
          isOpen={isPropertiesModalOpen}
          onClose={() => setPropertiesModalOpen(false)}
          node={selectedNode}
          onSave={handleSaveNodeProperties}
          allAssets={allAssets}
        />
      )}
    </div>
  );
};

const PropertiesDialog = ({ isOpen, onClose, node, onSave, allAssets }) => {
  const [properties, setProperties] = useState(node.data);

  useEffect(() => {
    setProperties(node.data);
  }, [node]);

  const handleSave = () => {
    onSave(properties);
  };

  const renderProperties = () => {
    switch (node.data.type) {
      case 'loadAsset':
        return (
          <div className="space-y-2">
            <label className="text-slate-800">Asset to Load</label>
            <Select onValueChange={(value) => {
              const asset = allAssets.find(a => a.id === value);
              setProperties({ ...properties, assetId: value, assetName: asset?.name });
            }} defaultValue={properties.assetId}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-800"><SelectValue placeholder="Select an asset" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-300 text-slate-800">
                {(allAssets || []).map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'runCalculation':
        return (
          <div className="space-y-2">
            <label className="text-slate-800">Calculation Type</label>
            <Select onValueChange={(value) => setProperties({ ...properties, calculation: value })} defaultValue={properties.calculation}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-800"><SelectValue placeholder="Select a calculation" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-300 text-slate-800">
                <SelectItem value="netPay">Net Pay</SelectItem>
                <SelectItem value="volumetrics">Volumetrics</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      default:
        return <p className="text-slate-800">No configurable properties for this node type.</p>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-slate-900">Properties for: {node.data.label}</DialogTitle>
          <DialogDescription className="text-slate-700">Configure the parameters for this workflow step.</DialogDescription>
        </DialogHeader>
        <div className="py-4">{renderProperties()}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WorkflowBuilderProvider = (props) => (
  <ReactFlowProvider>
    <WorkflowBuilder {...props} />
  </ReactFlowProvider>
);

export default WorkflowBuilderProvider;