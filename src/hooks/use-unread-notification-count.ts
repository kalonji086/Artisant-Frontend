import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

const UnreadNotificationCountContext = createContext<number | null>(null);

export function UnreadNotificationCountProvider({ children }: { children: ReactNode }) {
  const unreadCount = useUnreadNotificationCountSubscription();

  return createElement(UnreadNotificationCountContext.Provider, { value: unreadCount }, children);
}

export function useUnreadNotificationCount() {
  const unreadCount = useContext(UnreadNotificationCountContext);
  if (unreadCount === null) {
    throw new Error('useUnreadNotificationCount doit être utilisé dans <UnreadNotificationCountProvider>');
  }
  return unreadCount;
}

function useUnreadNotificationCountSubscription() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    const { count, error } = await supabase
      .from('app_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) {
      console.warn('[notifications] Comptage impossible:', error.message);
      return;
    }
    setUnreadCount(count ?? 0);
  }, [userId]);

  useEffect(() => {
    // Load server state on mount; updates happen after the request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUnreadCount();
    if (!userId) return;

    const channel = supabase
      .channel(`notification-count-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => void loadUnreadCount())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[notifications] Synchronisation en temps réel indisponible:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUnreadCount, userId]);

  return unreadCount;
}
