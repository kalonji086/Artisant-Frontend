import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase-client';
import api from '@/lib/api';
import { unregisterPushToken } from '@/lib/push-notifications';
import { uploadPendingArtisanAvatar } from '@/lib/artisan-avatar';
import { clearRememberedCredentials } from '@/lib/remembered-credentials';

export type Role = 'client' | 'artisan' | 'admin';

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: Role | null;
  profession: string | null;
  city: string | null;
  description: string | null;
  is_available: boolean | null;
  rating: number | null;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileRequestId = useRef(0);
  const profileController = useRef<AbortController | null>(null);

  useEffect(() => {
    void clearRememberedCredentials().catch((error: unknown) => {
      console.warn('[auth] Suppression des identifiants mémorisés impossible:', error);
    });
  }, []);

  const loadProfile = useCallback(async (userId: string | null) => {
    const requestId = ++profileRequestId.current;
    profileController.current?.abort();
    profileController.current = null;
    setProfileError(null);
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12_000);
    profileController.current = controller;
    setProfileLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone, role, profession, city, description, is_available, rating')
        .eq('id', userId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Profil introuvable pour ce compte.');
      if (requestId === profileRequestId.current) setProfile(data as Profile);
    } catch (error) {
      if (requestId !== profileRequestId.current) return;
      const message = timedOut
        ? 'Le chargement du profil a dépassé le délai autorisé. Vérifiez votre connexion puis réessayez.'
        : error instanceof Error
          ? error.message
          : 'Impossible de charger le profil.';
      console.error('[auth] Chargement du profil impossible:', error);
      setProfile(null);
      setProfileError(message);
    } finally {
      clearTimeout(timeout);
      if (requestId === profileRequestId.current) {
        profileController.current = null;
        setProfileLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let sessionTimeout: ReturnType<typeof setTimeout> | undefined;
    Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_resolve, reject) => {
        sessionTimeout = setTimeout(
          () => reject(new Error('Le délai de restauration de la session est dépassé.')),
          12_000
        );
      }),
    ])
      .then(async ({ data, error }) => {
        if (error) throw error;
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session?.user.id ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('[auth] Restauration de session impossible:', error);
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
      })
      .finally(() => {
        if (sessionTimeout) clearTimeout(sessionTimeout);
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Les écrans qui passent par l'API Express lisent ce token.
      api.setAuthToken(next?.access_token ?? null).catch(() => {});
      if (event === 'INITIAL_SESSION') return;
      setProfileError(null);
      setProfileLoading(!!next?.user.id);
      // Différé : on ne doit pas appeler Supabase directement dans ce callback.
      setTimeout(() => {
        if (active) void loadProfile(next?.user.id ?? null);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    let active = true;
    void uploadPendingArtisanAvatar(userId).catch((error: unknown) => {
      console.error('[auth] Envoi de la photo en attente impossible:', error);
      if (active) {
        Alert.alert(
          'Photo non envoyée',
          error instanceof Error ? error.message : 'La photo de profil n’a pas pu être envoyée. Réessayez après vérification de votre connexion.'
        );
      }
    });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;

    const channel = supabase
      .channel(`profile-live-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setProfile(null);
          setProfileError('Le profil associé à ce compte a été supprimé.');
          return;
        }
        setProfile(payload.new as Profile);
        setProfileError(null);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[auth] Synchronisation du profil indisponible:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      profileLoading,
      profileError,
      refreshProfile: () => loadProfile(session?.user.id ?? null),
      signOut: async () => {
        const userId = session?.user.id;
        if (userId) {
          try {
            await unregisterPushToken(userId);
          } catch (error) {
            console.warn('[push] Désinscription du téléphone impossible:', error);
          }
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        try {
          await clearRememberedCredentials();
        } catch (storageError) {
          console.warn('[auth] Suppression des identifiants mémorisés impossible:', storageError);
        }
        setProfile(null);
      },
    }),
    [session, profile, loading, profileLoading, profileError, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
