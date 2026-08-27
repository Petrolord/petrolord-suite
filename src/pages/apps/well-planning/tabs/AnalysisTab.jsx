import React from 'react';
    import { motion } from 'framer-motion';
    import { useToast } from '@/components/ui/use-toast';
    import { useNavigate } from 'react-router-dom';
    import { BookCopy, GitBranch, DollarSign, ShieldCheck } from 'lucide-react';

    const engineeringApps = [
        {
            name: 'Casing & Tubing Design',
            description: 'Full burst, collapse, and tension analysis for well integrity.',
            icon: BookCopy,
            appId: 'drilling/casing-tubing-design-pro',
            status: 'Available',
            color: 'from-gray-500 to-slate-600',
        },
        {
            name: 'Torque & Drag',
            description: 'Model forces on the drill string for complex well paths.',
            icon: GitBranch,
            appId: 'drilling/torque-drag-predictor',
            status: 'Available',
            color: 'from-fuchsia-500 to-pink-600',
        },
        {
            name: 'Cost Estimation (AFE)',
            description: 'Generate detailed cost estimates and manage AFE.',
            icon: DollarSign,
            appId: 'economics/afe-cost-control',
            status: 'Available',
            color: 'from-green-500 to-emerald-600',
        },
        {
            name: 'Wellbore Stability',
            description: 'Analyze geomechanical risks for a stable wellbore.',
            icon: ShieldCheck,
            appId: 'drilling/wellbore-stability-analyzer',
            status: 'Available',
            color: 'from-lime-500 to-green-600',
        }
    ];

    const AnalysisTab = ({ wellId }) => {
        const { toast } = useToast();
        const navigate = useNavigate();

        const handleAppClick = (app) => {
            if (app.status === 'Available') {
                navigate(`/dashboard/apps/${app.appId}?wellId=${wellId}`);
            } else {
                toast({
                    title: "🚧 Feature Coming Soon!",
                    description: `${app.name} isn't implemented yet.`,
                });
            }
        };

        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <h2 className="text-2xl font-bold text-white">Analysis & Engineering</h2>
                <p className="text-slate-400">
                    Dive deeper into the engineering and economic aspects of your well plan. Launch detailed analyses using the generated trajectory.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {engineeringApps.map((app, index) => (
                        <motion.div
                            key={app.name}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 * index }}
                            className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-lime-400/50 transition-all cursor-pointer flex flex-col items-start"
                            onClick={() => handleAppClick(app)}
                        >
                            <div className="flex items-center w-full mb-4">
                                <div className={`p-3 rounded-lg bg-gradient-to-r ${app.color}`}>
                                    <app.icon className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold text-white ml-4">{app.name}</h3>
                            </div>
                            <p className="text-slate-400 flex-grow mb-4">{app.description}</p>
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${app.status === 'Available' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                {app.status}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        );
    };

    export default AnalysisTab;