import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { refreshNotificationBadge } from '@/lib/notification-badge';
import { supabase } from '@/lib/supabase-client';

let notificationChannelSequence = 0;

export function NotificationBell() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    const loadUnread = async () => {
      try {
        const unreadCount = await refreshNotificationBadge(userId);
        if (active) setUnread(unreadCount);
      } catch (error) {
        console.error('[notifications] chargement du compteur impossible:', error);
      }
    };

    void loadUnread();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadUnread();
    });
    const channel = supabase
      .channel(`notification-count-${userId}-${notificationChannelSequence++}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
        () => void loadUnread(),
      )
      .subscribe();

    return () => {
      active = false;
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <TouchableOpacity
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} non lues` : 'Notifications'}
      hitSlop={8}
      style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="notifications-outline" size={23} color="#007AFF" />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            right: 2,
            top: 1,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: '#FF3B30',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
