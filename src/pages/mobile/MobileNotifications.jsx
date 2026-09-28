import React, { useState, useEffect } from 'react';
import { SupabaseService } from '@/services/SupabaseService';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MobileNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);

  const loadNotifications = async () => {
    const data = await SupabaseService.getUserNotifications(user.id);
    setNotifications(data || []);
  };

  const markRead = async (id) => {
    await SupabaseService.markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  return (
    <div className="p-4 min-h-full pb-24">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-bold text-pl-text">Notifications</h1>
            <Button variant="ghost" size="sm" onClick={loadNotifications}>Refresh</Button>
        </div>

        <div className="space-y-3">
            {notifications.map(note => (
                <div key={note.id} className={`p-4 rounded-lg border ${note.is_read ? 'bg-pl-sunken border-pl-border opacity-70' : 'bg-pl-surface border-pl-border-strong'}`}>
                    <div className="flex gap-3">
                        <div className={`mt-1 w-2 h-2 shrink-0 rounded-full ${note.type === 'alert' ? 'bg-pl-danger' : 'bg-pl-info'}`} aria-hidden="true" />
                        <span className="sr-only">{note.type === 'alert' ? 'Alert' : 'Notice'}</span>
                        <div className="flex-1">
                            <h4 className="text-sm font-semibold text-pl-text">{note.title}</h4>
                            <p className="text-xs text-pl-muted mt-1">{note.message}</p>
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-[10px] text-pl-muted">{new Date(note.created_at).toLocaleDateString()}</span>
                                {!note.is_read && (
                                    <button onClick={() => markRead(note.id)} className="text-pl-primary-text hover:text-pl-primary-text-hover text-xs flex items-center">
                                        <Check className="w-3 h-3 mr-1" /> Mark Read
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            {notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-pl-muted">
                    <Bell className="w-12 h-12 mb-4 opacity-20" />
                    <p>No notifications yet</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default MobileNotifications;