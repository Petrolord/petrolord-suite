import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function RenewalReminderBanner({ modules }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [expiringModules, setExpiringModules] = useState([]);

  useEffect(() => {
    if (!modules) return;
    
    // Find modules expiring in < 30 days
    const now = new Date();
    const expiring = modules.filter(m => {
        if (m.subscription_status !== 'active') return false;
        const expiry = new Date(m.expiry_date);
        const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        return days <= 30;
    });

    // Check if dismissed recently (simple local storage check)
    const dismissedAt = localStorage.getItem('renewal_banner_dismissed');
    const isDismissedRecently = dismissedAt && (now.getTime() - parseInt(dismissedAt) < 24 * 60 * 60 * 1000);

    if (expiring.length > 0 && !isDismissedRecently) {
        setExpiringModules(expiring);
        setVisible(true);
    }
  }, [modules]);

  const handleDismiss = () => {
      setVisible(false);
      localStorage.setItem('renewal_banner_dismissed', Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div className="bg-amber-900/30 border border-amber-900/50 rounded-lg p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-amber-900/50 p-2 rounded-full">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <div>
            <h4 className="text-amber-200 font-medium">Subscription Renewal Needed</h4>
            <p className="text-amber-400/80 text-sm">
                {expiringModules.length} module(s) are expiring soon: {expiringModules.map(m => m.module_name).join(', ')}.
            </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => navigate('/dashboard/subscriptions')}>
            Review & Renew
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDismiss} className="text-amber-400 hover:text-amber-200 hover:bg-amber-900/50">
            <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}