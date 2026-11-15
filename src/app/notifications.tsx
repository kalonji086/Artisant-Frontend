import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate, useUserPreferences } from '@/lib/user-preferences-context';

type AppNotification = {
  id: string;
  kind: 'message' | 'quote';
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslate();
  const { preferences } = useUserPreferences();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);
    const { data, error: loadError } = await supabase
      .from('app_notifications')
      .select('id, title, body, data, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (loadError) {
      setError(loadError.message);
    } else {
      setNotifications((data ?? []).map((row) => {
        const notificationData = (row.data ?? {}) as Record<string, unknown>;
        return {
          ...row,
          data: notificationData,
          kind: notificationData.screen === 'messages' ? 'message' : 'quote',
        };
      }) as AppNotification[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    // Load server state on mount; updates happen after the request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotifications();
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-live-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => void loadNotifications())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[notifications] Synchronisation en temps réel indisponible:', status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, userId]);

  const markRead = async (item: AppNotification) => {
    if (!userId || item.read_at) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('app_notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('user_id', userId)
      .is('read_at', null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === item.id ? { ...notification, read_at: readAt } : notification
      )
    );
  };

  const openNotification = async (item: AppNotification) => {
    await markRead(item);
    if (item.data.screen === 'messages') {
      const conversationId = item.data.conversation_id;
      router.push(
        typeof conversationId === 'string'
          ? { pathname: '/messages', params: { c: conversationId } }
          : '/messages'
      );
    } else if (item.data.screen === 'dashboard') {
      router.push('/dashboard');
    } else {
      router.push('/quotes');
    }
  };

  const markAllRead = async () => {
    if (!userId || !notifications.some((item) => !item.read_at)) return;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('app_notifications')
      .update({ read_at: readAt })
      .eq('user_id', userId)
      .is('read_at', null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('Notifications')}</Text>
        <TouchableOpacity onPress={() => void markAllRead()} disabled={!notifications.some((item) => !item.read_at)}>
          <Text style={[styles.markAll, { color: theme.accent }]}>
            {t('Tout marquer comme lu')}
          </Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={theme.accent} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadNotifications();
              }}
              tintColor={theme.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={38} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {t('Aucune notification pour le moment.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.row,
                { backgroundColor: theme.backgroundElement },
                !item.read_at && { borderLeftColor: theme.accent, borderLeftWidth: 3 },
              ]}
              onPress={() => void openNotification(item)}>
              <View style={[styles.icon, { backgroundColor: item.kind === 'message' ? `${theme.accent}1A` : '#fef3c7' }]}>
                <Ionicons
                  name={item.kind === 'message' ? 'chatbubble-outline' : 'document-text-outline'}
                  size={20}
                  color={item.kind === 'message' ? theme.accent : '#d97706'}
                />
              </View>
              <View style={styles.textContent}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{t(item.title)}</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>{item.body}</Text>
                <Text style={[styles.date, { color: theme.textSecondary }]}>
                  {new Date(item.created_at).toLocaleString(preferences.language === 'en' ? 'en-US' : 'fr-FR')}
                </Text>
              </View>
              {!item.read_at ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, borderBottomWidth: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  markAll: { fontSize: 13, fontWeight: '700' },
  list: { padding: 14, gap: 10, flexGrow: 1 },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  textContent: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 18 },
  date: { fontSize: 11 },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  empty: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  loader: { flex: 1 },
  error: { paddingHorizontal: 16, paddingTop: 10, color: '#b42318', fontSize: 13 },
});
