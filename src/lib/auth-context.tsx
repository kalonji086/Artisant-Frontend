import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import api from '@/lib/api';

export type Role = 'client' | 'artisan' | 'admin';

export type Profile = {
  id: string;
  full_name: string | null;
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
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, profession, city, description, is_available, rating')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session?.user.id ?? null);
      })
      .finally(() => active && setLoading(false));

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
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      refreshProfile: () => loadProfile(session?.user.id ?? null),
      signOut: async () => {
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
