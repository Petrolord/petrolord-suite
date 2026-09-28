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
        },
        {
            name: 'Torque & Drag',
            description: 'Model forces on the drill string for complex well paths.',
            icon: GitBranch,
            appId: 'drilling/torque-drag-predictor',
            status: 'Available',
        },
        {
            name: 'Cost Estimation (AFE)',
            description: 'Generate detailed cost estimates and manage AFE.',
            icon: DollarSign,
            appId: 'economics/afe-cost-control',
            status: 'Available',
        },
        {
            name: 'Wellbore Stability',
            description: 'Analyze geomechanical risks for a stable wellbore.',
            icon: ShieldCheck,
            appId: 'drilling/wellbore-stability-analyzer',
            status: 'Available',
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
                <h2 className="text-2xl font-bold text-pl-text">Analysis & Engineering</h2>
                <p className="text-pl-muted">
                    Dive deeper into the engineering and economic aspects of your well plan. Launch detailed analyses using the generated trajectory.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {engineeringApps.map((app, index) => (
                        <motion.div
                            key={app.name}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 * index }}
                            className="bg-pl-sunken border border-pl-border rounded-lg p-6 hover:border-pl-primary transition-all cursor-pointer flex flex-col items-start"
                            onClick={() => handleAppClick(app)}
                        >
                            <div className="flex items-center w-full mb-4">
                                <div className="p-3 rounded-lg bg-pl-primary">
                                    <app.icon className="w-6 h-6 text-pl-primary-fg" />
                                </div>
                                <h3 className="text-xl font-semibold text-pl-text ml-4">{app.name}</h3>
                            </div>
                            <p className="text-pl-muted flex-grow mb-4">{app.description}</p>
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${app.status === 'Available' ? 'bg-pl-success-bg text-pl-success-text' : 'bg-pl-sunken text-pl-muted'}`}>
                                {app.status}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        );
    };

    export default AnalysisTab;