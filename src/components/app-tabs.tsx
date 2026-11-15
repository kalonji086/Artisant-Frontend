import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

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
  const colors = useTheme();
  const t = useTranslate();
  const { profile } = useAuth();
  const isArtisan = profile?.role === 'artisan';

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
          href: null,
          title: t('Alertes'),
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
      <Tabs.Screen name="(auth)/signup" options={{ href: null, title: t('Créer un compte'), tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="(auth)/forgot-password" options={{ href: null, title: t('Mot de passe oublié'), tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="(auth)/reset-password" options={{ href: null, title: t('Nouveau mot de passe'), tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="(auth)/legal/[slug]" options={{ href: null, title: t('Informations légales'), tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
