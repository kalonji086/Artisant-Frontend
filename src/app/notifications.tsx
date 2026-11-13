import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { refreshNotificationBadge } from '@/lib/notification-badge';

type AppNotification = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  data: { quoteId?: string; conversationId?: string };
  created_at: string;
  read_at: string | null;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { session, role } = useAuth();
  const userId = session?.user.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('app_notifications')
      .select('id, notification_type, title, body, data, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[notifications] chargement impossible:', error.message);
      Alert.alert('Notifications indisponibles', error.message);
    } else {
      setNotifications((data ?? []) as AppNotification[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // Load asynchronously, then subscribe to changes for this account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const openNotification = async (item: AppNotification) => {
    if (!item.read_at) {
      const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: item.id });
      if (error) {
        Alert.alert('Erreur', error.message);
        return;
      }
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification,
        ),
      );
      if (userId) {
        void refreshNotificationBadge(userId).catch((badgeError: unknown) => {
          console.error('[notifications] mise à jour du compteur impossible:', badgeError);
        });
      }
    }

    if (item.data?.conversationId) {
      router.push({ pathname: '/messages', params: { c: item.data.conversationId } });
    } else if (role === 'artisan' && item.data?.quoteId) {
      router.push('/dashboard');
    } else if (item.data?.quoteId) {
      router.push('/quotes');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={{ color: '#222', fontSize: 20, fontWeight: '700' }}>Notifications</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" style={{ flex: 1 }} />
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="notifications-off-outline" size={42} color="#999" />
          <Text style={{ color: '#666', marginTop: 12 }}>Aucune notification pour le moment.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {notifications.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => void openNotification(item)}
              style={{
                padding: 14,
                borderRadius: 12,
                backgroundColor: item.read_at ? '#fff' : '#eaf3ff',
                borderWidth: 1,
                borderColor: item.read_at ? '#eee' : '#c9e0ff',
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons
                  name={item.notification_type === 'chat' ? 'chatbubble-outline' : 'document-text-outline'}
                  size={18}
                  color="#007AFF"
                />
                <Text style={{ flex: 1, color: '#222', fontWeight: '700' }}>{item.title}</Text>
                {!item.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF' }} />}
              </View>
              <Text style={{ color: '#444', marginTop: 7 }}>{item.body}</Text>
              <Text style={{ color: '#888', fontSize: 12, marginTop: 7 }}>
                {new Date(item.created_at).toLocaleString('fr-FR')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
