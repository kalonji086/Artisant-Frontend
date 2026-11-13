import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ColorValue } from 'react-native';

import { useSettings } from '@/lib/settings-context';
import { useAuth } from '@/lib/auth-context';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  explore: 'compass',
  dashboard: 'grid',
  quotes: 'document-text',
  messages: 'chatbubbles',
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
  const { colors: c, accent, t } = useSettings();
  const { role } = useAuth();
  const isArtisan = role === 'artisan';

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ color, size }) => tabIcon('index', color, size),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
          title: 'Explore',
          tabBarIcon: ({ color, size }) => tabIcon('explore', color, size),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          href: isArtisan ? undefined : null,
          title: t('tab.dashboard'),
          tabBarIcon: ({ color, size }) => tabIcon('dashboard', color, size),
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          href: isArtisan ? null : undefined,
          title: t('tab.quotes'),
          tabBarIcon: ({ color, size }) => tabIcon('quotes', color, size),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tab.messages'),
          tabBarIcon: ({ color, size }) => tabIcon('messages', color, size),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ color, size }) => tabIcon('profile', color, size),
        }}
      />
      {/* Écran de recherche : accessible via navigation, caché des onglets */}
      <Tabs.Screen
        name="search"
        options={{
          href: null,
          title: 'Recherche',
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null, title: t('tab.settings'), tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications', tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="subscriptions" options={{ href: null, title: 'Abonnements', tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="proposal" options={{ href: null, title: 'Devis professionnel', tabBarStyle: { display: 'none' } }} />
      {/* Écrans d'authentification : accessibles via navigation, cachés des onglets */}
      <Tabs.Screen
        name="(auth)/login"
        options={{
          href: null,
          title: 'Connexion',
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="(auth)/forgot-password"
        options={{
          href: null,
          title: 'Mot de passe oublié',
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
