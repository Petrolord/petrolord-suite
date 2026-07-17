// Notification state for Studio-shell apps: add with 5s auto-dismiss, manual
// remove. Feed the result into <StudioLayout notifications onDismissNotification>.
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function useStudioNotifications() {
  const [notifications, setNotifications] = useState([]);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((message, type = 'info') => {
    const id = uuidv4();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeNotification(id), 5000);
  }, [removeNotification]);

  return { notifications, addNotification, removeNotification };
}
