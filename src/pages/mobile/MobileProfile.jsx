import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, Settings, HelpCircle, Shield } from 'lucide-react';

const MobileProfile = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="p-4 min-h-full pb-24">
      <div className="flex flex-col items-center py-8">
        <Avatar className="w-24 h-24 mb-4 bg-pl-primary border-4 border-pl-surface">
            <AvatarFallback className="text-2xl text-pl-primary-fg bg-transparent">
                {user?.email?.[0]?.toUpperCase()}
            </AvatarFallback>
        </Avatar>
        <h2 className="text-xl font-bold text-pl-text">{user?.user_metadata?.full_name || 'User'}</h2>
        <p className="text-sm text-pl-muted break-all">{user?.email}</p>
      </div>

      <div className="space-y-2">
        <div className="bg-pl-surface border border-pl-border rounded-lg overflow-hidden">
            <button className="w-full p-4 flex items-center gap-3 text-pl-text hover:bg-pl-sunken transition-colors text-left border-b border-pl-border">
                <Settings className="w-5 h-5 text-pl-muted" aria-hidden="true" />
                <span>App Settings</span>
            </button>
            <button className="w-full p-4 flex items-center gap-3 text-pl-text hover:bg-pl-sunken transition-colors text-left border-b border-pl-border">
                <Shield className="w-5 h-5 text-pl-muted" aria-hidden="true" />
                <span>Privacy & Security</span>
            </button>
            <button className="w-full p-4 flex items-center gap-3 text-pl-text hover:bg-pl-sunken transition-colors text-left">
                <HelpCircle className="w-5 h-5 text-pl-muted" aria-hidden="true" />
                <span>Help & Support</span>
            </button>
        </div>

        <Button 
            variant="destructive" 
            className="w-full mt-8 flex items-center gap-2"
            onClick={() => signOut()}
        >
            <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
      
      <div className="text-center text-xs text-pl-muted mt-8">
        Version 1.0.0 (PWA)
      </div>
    </div>
  );
};

export default MobileProfile;