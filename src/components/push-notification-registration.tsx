import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { registerPushToken } from '@/lib/push-notifications';

export function PushNotificationRegistration() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let active = true;
    const synchronizeToken = async () => {
      try {
        const permission = await Notifications.getPermissionsAsync();
        if (!active || !permission.granted) return;
        await registerPushToken(userId, { requestPermission: false });
      } catch (error: unknown) {
        console.error('[push] Enregistrement du téléphone impossible:', error);
      }
    };

    void synchronizeToken();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void synchronizeToken();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let active = true;

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      if (handledResponseId.current === request.identifier) return;
      handledResponseId.current = request.identifier;

      const data = request.content.data ?? {};
      const notificationId = data.notification_id;
      if (typeof notificationId === 'string') {
        void supabase
          .from('app_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('user_id', userId)
          .is('read_at', null)
          .then(({ error }) => {
            if (error) console.warn('[push] Impossible de marquer l’alerte comme lue:', error.message);
          });
      }

      if (data.screen === 'messages') {
        router.push(
          typeof data.conversation_id === 'string'
            ? { pathname: '/messages', params: { c: data.conversation_id } }
            : '/messages'
        );
      } else if (data.screen === 'dashboard') {
        router.push('/dashboard');
      } else {
        router.push('/quotes');
      }
      void Notifications.clearLastNotificationResponseAsync().catch((error: unknown) => {
        console.warn('[push] Effacement de la notification ouverte impossible:', error);
      });
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) handleResponse(response);
      })
      .catch((error: unknown) => {
        console.warn('[push] Lecture de la dernière notification impossible:', error);
      });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router, userId]);

  return null;
}
