import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { api } from '@/lib/api';
import { clearRestoreKey, signInWithRestoreKey } from '@/lib/restore-credentials';

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
  phone_public: boolean | null;
  rating: number | null;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    // Le profil est créé par un trigger après l'inscription : on réessaie quelques fois
    // pour éviter que le garde de navigation reste bloqué sans rôle.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone, role, profession, city, description, is_available, phone_public, rating')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        setProfile(data as Profile);
        return;
      }
      if (error) console.error('[auth] chargement du profil impossible:', error.message);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    setProfile(null);
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;

    const channel = supabase
      .channel(`profile-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, () => {
        void loadProfile(userId);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[auth] synchronisation du profil indisponible:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id, loadProfile]);

  useEffect(() => {
    let active = true;
    const initializationTimeout = setTimeout(() => {
      if (!active) return;
      console.error('[auth] initialisation trop longue; poursuite sans session chargée.');
      setLoading(false);
    }, 15_000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        let current: Session | null = data.session;
        if (!current) {
          // Connexion silencieuse via la clé de restauration (nouvel appareil).
          await signInWithRestoreKey().catch(() => false);
          current = (await supabase.auth.getSession()).data.session;
        }
        setSession(current);
        await loadProfile(current?.user.id ?? null);
      })
      .catch((error: unknown) => {
        console.error('[auth] initialisation impossible:', error);
      })
      .finally(() => {
        clearTimeout(initializationTimeout);
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Les écrans qui passent par l'API Express lisent ce token.
      api.setAuthToken(next?.access_token ?? null).catch(() => {});
      // Différé : on ne doit pas appeler Supabase directement dans ce callback.
      setTimeout(() => {
        if (active) loadProfile(next?.user.id ?? null);
      }, 0);
    });

    return () => {
      active = false;
      clearTimeout(initializationTimeout);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      role: profile?.role ?? (
        session?.user.user_metadata?.role === 'client' ||
        session?.user.user_metadata?.role === 'artisan'
          ? session.user.user_metadata.role
          : null
      ),
      loading,
      refreshProfile: () => loadProfile(session?.user.id ?? null),
      signOut: async () => {
        await clearRestoreKey().catch(() => {});
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
