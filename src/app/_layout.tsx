import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Alert, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { UserPreferencesProvider } from '@/lib/user-preferences-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { SplashLoader } from '@/components/splash-loader';
import AppTabs from '@/components/app-tabs';
import { LocationTracker } from '@/components/location-tracker';
import { PushNotificationRegistration } from '@/components/push-notification-registration';
import { UnreadNotificationCountProvider } from '@/hooks/use-unread-notification-count';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.warn('[splash] Impossible de retarder l’écran natif:', error);
});

export default function TabLayout() {
  // Charger la police Ionicons avant le rendu — sinon les icônes
  // (tabs + boutons login/signup/artisan-signup/search) sont invisibles
  // sur Android tant que la fonte n'est pas prête.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timeout = setTimeout(() => setFontLoadTimedOut(true), 10_000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  const fontsReady = fontsLoaded || !!fontError || fontLoadTimedOut;

  useEffect(() => {
    if (fontError) console.warn('[splash] Chargement des icônes impossible:', fontError);
    if (fontLoadTimedOut && !fontsLoaded && !fontError) {
      console.warn('[splash] Délai de chargement des icônes dépassé; poursuite sans la police personnalisée.');
    }
    if (fontsReady) {
      void SplashScreen.hideAsync().catch((error: unknown) => {
        console.warn('[splash] Impossible de masquer l’écran natif:', error);
      });
    }
  }, [fontsReady, fontError, fontLoadTimedOut, fontsLoaded]);

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <UserPreferencesProvider>
          <StartupSplash />
          <AuthGuard />
          <LocationTracker />
          <PushNotificationRegistration />
          <UnreadNotificationCountProvider>
            <AppTabs />
          </UnreadNotificationCountProvider>
        </UserPreferencesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Transition logo + barre de progression : à l'ouverture et après chaque connexion.
function StartupSplash() {
  const { session, loading, profileLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const ready = !loading && !profileLoading;
  return <SplashSession key={userId ?? 'guest'} ready={ready} first={!userId} />;
}

function SplashSession({ ready, first }: { ready: boolean; first: boolean }) {
  const [done, setDone] = useState(false);
  const handleDone = useCallback(() => setDone(true), []);
  if (done) return null;
  return <SplashLoader ready={ready} onDone={handleDone} minDuration={first ? 2200 : 1500} />;
}

// Redirige selon la session et le rôle :
// pas connecté -> login ; client -> accueil ; artisan -> dashboard.
function AuthGuard() {
  const { session, profile, loading, profileLoading, profileError, refreshProfile, signOut } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();
  const promptedUser = useRef<string | null>(null);

  const inAuth = segments[0] === '(auth)';
  const current = segments[0] ?? 'index';
  const authPage = segments[1] ?? '';
  const canStayInAuth =
    authPage === 'reset-password'
    || authPage === 'legal'
    || authPage === 'help'
    || authPage === 'support-request';
  const userId = session?.user.id;
  const role = profile?.role;

  useEffect(() => {
    if (!userId || loading || profileLoading || role || !profileError || promptedUser.current === userId) return;
    promptedUser.current = userId;
    Alert.alert('Profil indisponible', profileError, [
      {
        text: 'Réessayer',
        onPress: () => {
          promptedUser.current = null;
          void refreshProfile();
        },
      },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          void signOut()
            .then(() => router.replace('/(auth)/login'))
            .catch((error: unknown) => {
              console.error('[auth] Déconnexion impossible:', error);
              Alert.alert('Erreur', 'Impossible de fermer la session. Réessayez.');
            });
        },
      },
    ]);
  }, [userId, loading, profileLoading, role, profileError, refreshProfile, signOut, router]);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      if (!inAuth && current !== 'account-deletion') router.replace('/(auth)/login');
      return;
    }
    if (!role) return; // profil en cours de chargement
    if (inAuth) {
      if (canStayInAuth) return;
      router.replace(role === 'artisan' ? '/dashboard' : '/');
    } else if (current === 'dashboard' && role !== 'artisan') {
      router.replace('/');
    }
  }, [loading, userId, role, inAuth, current, authPage, canStayInAuth, router]);

  return null;
}
