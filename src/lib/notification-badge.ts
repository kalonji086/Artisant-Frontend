import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase-client';

export const ANDROID_NOTIFICATION_CHANNEL_ID = 'app-notifications';

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: 'Notifications',
    description: 'Messages et mises à jour de votre compte Artisants',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    showBadge: true,
  });
}

export async function refreshNotificationBadge(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
  const unread = count ?? 0;
  if (Platform.OS !== 'web') {
    const updated = await Notifications.setBadgeCountAsync(unread);
    if (!updated) {
      console.warn('[notifications] ce lanceur Android ne prend pas en charge les badges d’icône.');
    }
  }
  return unread;
}
