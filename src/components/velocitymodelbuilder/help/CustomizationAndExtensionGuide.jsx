import React from 'react';
import { Code, Puzzle, Settings } from 'lucide-react';

const CustomizationAndExtensionGuide = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-bold text-white">Customization & Extensions</h2>
        
        <div className="space-y-4">
            <div className="flex gap-4 p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="mt-1"><Code className="w-5 h-5 text-purple-400" /></div>
                <div>
                    <h3 className="text-white font-medium mb-1">Custom Velocity Functions</h3>
                    <p className="text-sm text-slate-400">
                        Need a function not in the standard library? You can write custom Python or JavaScript snippets to define V(x,y,z).
                        <br />
                        <code className="text-xs bg-slate-950 px-1 py-0.5 rounded border border-slate-800 text-purple-300 mt-1 inline-block">
                            def velocity(z, params): return params.v0 + params.k * Math.pow(z, params.n)
                        </code>
                    </p>
                </div>
            </div>

            <div className="flex gap-4 p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="mt-1"><Puzzle className="w-5 h-5 text-blue-400" /></div>
                <div>
                    <h3 className="text-white font-medium mb-1">Plugin Architecture</h3>
                    <p className="text-sm text-slate-400">
                        Build custom QC plots or export formats using our React-based plugin system. Plugins run in a sandboxed environment and can be shared across your organization.
                    </p>
                </div>
            </div>

            <div className="flex gap-4 p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="mt-1"><Settings className="w-5 h-5 text-emerald-400" /></div>
                <div>
                    <h3 className="text-white font-medium mb-1">Workflow Automation</h3>
                    <p className="text-sm text-slate-400">
                        Chain multiple steps (Import -&gt; QC -&gt; Build -&gt; Export) into a reusable "Recipe". Great for standardizing velocity modeling workflows across asset teams.
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default CustomizationAndExtensionGuide;