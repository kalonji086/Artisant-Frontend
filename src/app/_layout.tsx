import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { SplashLoader } from '@/components/splash-loader';
import AppTabs from '@/components/app-tabs';
import { LocationTracker } from '@/components/location-tracker';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  // Charger la police Ionicons avant le rendu — sinon les icônes
  // (tabs + boutons login/signup/artisan-signup/search) sont invisibles
  // sur Android tant que la fonte n'est pas prête.
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StartupSplash />
      <AuthGuard />
      <LocationTracker />
      <AppTabs />
    </AuthProvider>
  );
}

// Transition logo + barre de progression : à l'ouverture et après chaque connexion.
function StartupSplash() {
  const { session, profile, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const ready = !loading && (!userId || !!profile?.role);
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
  const { session, profile, loading } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  const inAuth = segments[0] === '(auth)';
  const current = segments[0] ?? 'index';
  const userId = session?.user.id;
  const role = profile?.role;

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }
    if (!role) return; // profil en cours de chargement
    if (inAuth) {
      router.replace(role === 'artisan' ? '/dashboard' : '/');
    } else if (current === 'dashboard' && role !== 'artisan') {
      router.replace('/');
    }
  }, [loading, userId, role, inAuth, current, router]);

  return null;
}
