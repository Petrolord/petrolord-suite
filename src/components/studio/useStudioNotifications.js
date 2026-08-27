// Notification state for Studio-shell apps: add with 5s auto-dismiss, manual
// remove. Feed the result into <StudioLayout notifications onDismissNotification>.
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function useStudioNotifications() {
  const [notifications, setNotifications] = useState([]);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Optional third argument:
  //   { duration: ms before auto-dismiss (default 5000),
  //     action: { label, onClick } — rendered as a button on the toast
  //             (e.g. Undo for recoverable deletes); clicking it runs
  //             onClick and dismisses the toast. }
  const addNotification = useCallback((message, type = 'info', options = {}) => {
    const id = uuidv4();
    const { duration = 5000, action = null } = options;
    setNotifications((prev) => [...prev, { id, message, type, action }]);
    setTimeout(() => removeNotification(id), duration);
  }, [removeNotification]);

  return { notifications, addNotification, removeNotification };
}
