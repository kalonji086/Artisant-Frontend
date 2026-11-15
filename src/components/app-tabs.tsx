import { useCallback, useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';
import { supabase } from '@/lib/supabase-client';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  explore: 'compass',
  dashboard: 'grid',
  quotes: 'document-text',
  messages: 'chatbubbles',
  notifications: 'notifications',
  profile: 'person',
};

function tabIcon(routeName: string, color: ColorValue, size: number) {
  return (
    <Ionicons
      name={TAB_ICONS[routeName] ?? 'ellipse'}
      size={size}
      color={color as string}
    />
  );
}

export default function AppTabs() {
  const colors = useTheme();
  const t = useTranslate();
  const { profile, session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const isArtisan = profile?.role === 'artisan';
  const userId = session?.user.id;

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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.backgroundSelected },
        tabBarBadgeStyle: { backgroundColor: colors.accent },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('Accueil'),
          tabBarIcon: ({ color, size }) => tabIcon('index', color, size),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
          title: t('Explorer'),
          tabBarIcon: ({ color, size }) => tabIcon('explore', color, size),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          href: isArtisan ? undefined : null,
          title: t('Tableau de bord'),
          tabBarIcon: ({ color, size }) => tabIcon('dashboard', color, size),
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          href: isArtisan ? null : undefined,
          title: t('Mes devis'),
          tabBarIcon: ({ color, size }) => tabIcon('quotes', color, size),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('Messages'),
          tabBarIcon: ({ color, size }) => tabIcon('messages', color, size),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('Alertes'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarIcon: ({ color, size }) => tabIcon('notifications', color, size),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profil'),
          tabBarIcon: ({ color, size }) => tabIcon('profile', color, size),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: t('Paramètres'),
        }}
      />
      {/* Écran de recherche : accessible via navigation, caché des onglets */}
      <Tabs.Screen
        name="search"
        options={{
          href: null,
          title: t('Recherche'),
        }}
      />
      {/* Écrans d'authentification : accessibles via navigation, cachés des onglets */}
      <Tabs.Screen
        name="(auth)/login"
        options={{
          href: null,
          title: t('Connexion'),
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen name="(auth)/forgot-password" options={{ href: null, title: t('Mot de passe oublié') }} />
      <Tabs.Screen name="(auth)/reset-password" options={{ href: null, title: t('Nouveau mot de passe') }} />
      <Tabs.Screen name="(auth)/legal/[slug]" options={{ href: null, title: t('Informations légales') }} />
    </Tabs>
  );
}
