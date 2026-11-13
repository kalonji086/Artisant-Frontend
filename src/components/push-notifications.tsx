import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import {
  ensureNotificationChannel,
  refreshNotificationBadge,
} from '@/lib/notification-badge';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult = { ok: true } | { ok: false; reason: string };

export async function registerPushToken(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { ok: false, reason: 'Les notifications push nécessitent un appareil physique.' };
  }
  await ensureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted
    ? 'granted'
    : (
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      })
    ).status;
  if (status !== 'granted') {
    return { ok: false, reason: 'Autorisez les notifications dans les réglages de votre téléphone.' };
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return { ok: false, reason: 'La configuration Expo des notifications est introuvable.' };
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return { ok: false, reason: 'Expo n’a pas fourni de token de notification.' };
  const { error } = await supabase.rpc('set_my_push_token', { p_token: token });
  if (error) throw error;
  return { ok: true };
}

// Enregistre le token Expo de l'utilisateur connecté et ouvre l'écran voulu au toucher d'une notification.
export function PushNotifications() {
  const router = useRouter();
  const { role, loading, session } = useAuth();
  const userId = session?.user.id;
  const handledResponse = useRef<string | null>(null);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    void ensureNotificationChannel().catch((error: unknown) => {
      console.error('[notifications] création du canal Android impossible:', error);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    const syncBadge = () => {
      void refreshNotificationBadge(userId).catch((error: unknown) => {
        console.error('[notifications] synchronisation du badge impossible:', error);
      });
    };
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncBadge();
    });
    const received = Notifications.addNotificationReceivedListener(syncBadge);
    syncBadge();

    return () => {
      appState.remove();
      received.remove();
    };
  }, [userId]);

  const openNotificationTarget = useCallback((response: Notifications.NotificationResponse) => {
    if (loading) {
      pendingResponse.current = response;
      return;
    }

    const requestId = response.notification.request.identifier;
    if (handledResponse.current === requestId) return;
    handledResponse.current = requestId;

    const data = response.notification.request.content.data as {
      type?: string;
      conversationId?: string;
      quoteId?: string;
      notificationId?: string;
    };
    if (data.notificationId) {
      void (async () => {
        try {
          const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: data.notificationId });
          if (error) {
            console.error('[notifications] marquage comme lue impossible:', error.message);
            return;
          }
          if (userId) await refreshNotificationBadge(userId);
        } catch (error) {
          console.error('[notifications] marquage comme lue impossible:', error);
        }
      })();
    }

    if (data?.type === 'chat' && data.conversationId) {
      router.push({ pathname: '/messages', params: { c: data.conversationId } });
    } else if (data?.type === 'quote' || data?.quoteId) {
      router.push(role === 'artisan' ? '/dashboard' : '/quotes');
    }
  }, [loading, role, router, userId]);

  useEffect(() => {
    let active = true;
    const sub = Notifications.addNotificationResponseReceivedListener(openNotificationTarget);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) openNotificationTarget(response);
    }).catch((error: unknown) => {
      console.error('[notifications] ouverture de la notification au démarrage impossible:', error);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [openNotificationTarget]);

  useEffect(() => {
    if (!loading && pendingResponse.current) {
      const response = pendingResponse.current;
      pendingResponse.current = null;
      openNotificationTarget(response);
    }
  }, [loading, openNotificationTarget]);

  return null;
}
