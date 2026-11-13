import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, Platform, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { SettingsProvider, useSettings } from '@/lib/settings-context';
import { supabase } from '@/lib/supabase-client';
import { useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { SplashLoader } from '@/components/splash-loader';
import AppTabs from '@/components/app-tabs';
import { LocationTracker } from '@/components/location-tracker';
import { PushNotifications } from '@/components/push-notifications';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  // Charger la police Ionicons avant le rendu — sinon les icônes
  // (tabs + boutons login/signup/artisan-signup/search) sont invisibles
  // sur Android tant que la fonte n'est pas prête.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });
  const [fontTimeout, setFontTimeout] = useState(false);
  const fontsReady = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (fontsReady) return;

    const timeout = setTimeout(() => {
      console.error('[startup] chargement des polices trop long; démarrage sans les icônes.');
      setFontTimeout(true);
    }, 10_000);

    return () => clearTimeout(timeout);
  }, [fontsReady]);

  useEffect(() => {
    if (fontError) {
      console.error('[startup] chargement de la police Ionicons impossible:', fontError);
    }
    if (fontsReady) {
      SplashScreen.hideAsync().catch((error: unknown) => {
        console.error('[startup] fermeture de l’écran natif impossible:', error);
      });
    }
  }, [fontsReady, fontError]);

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <SettingsProvider>
        <ThemedStatusBar />
        <OtaUpdateCheck />
        <StartupSplash />
        <AuthGuard />
        <LocationTracker />
        <PushNotifications />
        <AppTabs />
        <AnnouncementBanner />
        <MaintenanceGate />
      </SettingsProvider>
    </AuthProvider>
  );
}

function OtaUpdateCheck() {
  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;

    let active = true;
    let checking = false;
    const checkForUpdate = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (active && update.isAvailable) {
          const result = await Updates.fetchUpdateAsync();
          if (result.isNew) {
            console.info('[updates] mise à jour téléchargée; elle sera appliquée au prochain lancement.');
          }
        }
      } catch (error) {
        console.warn('[updates] vérification ou téléchargement impossible:', error);
      } finally {
        checking = false;
      }
    };

    void checkForUpdate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return null;
}

function ThemedStatusBar() {
  const { dark } = useSettings();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

function AnnouncementBanner() {
  const { config, accent } = useSettings();
  const [dismissed, setDismissed] = useState('');
  if (!config.announcement || dismissed === config.announcement) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: accent, paddingTop: 40, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, color: '#ffffff', fontSize: 13 }}>{config.announcement}</Text>
      <TouchableOpacity onPress={() => setDismissed(config.announcement)} hitSlop={10}>
        <Ionicons name="close" size={20} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

// Bloque l'app (sauf admin) pendant la maintenance.
function MaintenanceGate() {
  const { config, colors, accent, t } = useSettings();
  const { profile, session } = useAuth();
  if (!config.maintenance_mode || profile?.role === 'admin') return null;
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Ionicons name="construct" size={56} color={accent} />
      <Text style={{ fontSize: 22, fontWeight: 'bold', color: colors.text, textAlign: 'center' }}>{t('maintenance.title')}</Text>
      <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>{config.maintenance_message || t('maintenance.default')}</Text>
      {!!session && (
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={{ color: accent, fontWeight: '600' }}>{t('maintenance.signout')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Transition logo + barre de progression : à l'ouverture et après chaque connexion.
function StartupSplash() {
  const { session, role, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const ready = !loading && (!userId || !!role);
  return <SplashSession key={userId ?? 'guest'} ready={ready} first={!userId} />;
}

function SplashSession({ ready, first }: { ready: boolean; first: boolean }) {
  const [done, setDone] = useState(false);
  const [startupFallback, setStartupFallback] = useState(false);
  const handleDone = useCallback(() => setDone(true), []);

  useEffect(() => {
    if (ready) return;

    const timeout = setTimeout(() => {
      console.warn('[startup] chargement trop long; fermeture de l’écran de démarrage.');
      setStartupFallback(true);
    }, 15_000);

    return () => clearTimeout(timeout);
  }, [ready]);

  if (done) return null;
  return <SplashLoader ready={ready || startupFallback} onDone={handleDone} minDuration={first ? 2200 : 1500} />;
}

// Redirige selon la session et le rôle :
// pas connecté -> login ; client -> accueil ; artisan -> dashboard.
function AuthGuard() {
  const { session, role, loading } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  const inAuth = segments[0] === '(auth)';
  const isForgotPassword = inAuth && segments[1] === 'forgot-password';
  const current = segments[0] ?? 'index';
  const userId = session?.user.id;

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }
    if (!role) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }
    if (inAuth && !isForgotPassword) {
      router.replace(role === 'artisan' ? '/dashboard' : '/');
    } else if (current === 'dashboard' && role !== 'artisan') {
      router.replace('/');
    }
  }, [loading, userId, role, inAuth, isForgotPassword, current, router]);

  return null;
}
