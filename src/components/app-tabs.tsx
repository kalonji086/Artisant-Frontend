import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme, type ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';
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
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { profile } = useAuth();
  const isArtisan = profile?.role === 'artisan';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
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
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => tabIcon('dashboard', color, size),
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          href: isArtisan ? null : undefined,
          title: 'Mes devis',
          tabBarIcon: ({ color, size }) => tabIcon('quotes', color, size),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => tabIcon('messages', color, size),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
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
      {/* Écrans d'authentification : accessibles via navigation, cachés des onglets */}
      <Tabs.Screen
        name="(auth)/login"
        options={{
          href: null,
          title: 'Connexion',
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
