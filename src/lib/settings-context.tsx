import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { translate, type Lang, type TKey } from '@/lib/i18n';
import { setPalette } from '@/lib/themed-styles';

export type ThemePref = 'default' | 'light' | 'dark' | 'system';
export type LangPref = 'default' | Lang;

export type PlatformConfig = {
  platform_name: string;
  support_email: string;
  contact_email: string | null;
  facebook_url: string | null;
  github_url: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  app_primary_color: string;
  default_language: Lang;
  default_theme: 'light' | 'dark' | 'system';
  maintenance_mode: boolean;
  maintenance_message: string;
  announcement: string;
  allow_signups: boolean;
};

type Prefs = { theme: ThemePref; language: LangPref; accent: string | null };

const DEFAULT_CONFIG: PlatformConfig = {
  platform_name: 'ARTISANTS',
  support_email: '',
  contact_email: null,
  facebook_url: null,
  github_url: null,
  x_url: null,
  linkedin_url: null,
  instagram_url: null,
  app_primary_color: '#007AFF',
  default_language: 'fr',
  default_theme: 'light',
  maintenance_mode: false,
  maintenance_message: '',
  announcement: '',
  allow_signups: true,
};
const DEFAULT_PREFS: Prefs = { theme: 'default', language: 'default', accent: null };

const PREFS_KEY = 'app.prefs.v2';
const CONFIG_KEY = 'app.config.v1';
const COLUMNS =
  'platform_name, support_email, contact_email, facebook_url, github_url, x_url, linkedin_url, instagram_url, app_primary_color, default_language, default_theme, maintenance_mode, maintenance_message, announcement, allow_signups';

type SettingsState = {
  config: PlatformConfig;
  prefs: Prefs;
  dark: boolean;
  accent: string;
  language: Lang;
  t: (key: TKey) => string;
  prefsSyncError: string | null;
  setPrefs: (patch: Partial<Prefs>) => Promise<void>;
  resetPrefs: () => Promise<void>;
  colors: { bg: string; card: string; text: string; muted: string; border: string };
};

const SettingsContext = createContext<SettingsState | null>(null);

const sanitize = (row: Partial<PlatformConfig> | null | undefined): PlatformConfig => {
  const r = { ...DEFAULT_CONFIG, ...(row ?? {}) };
  if (!/^#[0-9A-Fa-f]{6}$/.test(r.app_primary_color)) r.app_primary_color = DEFAULT_CONFIG.app_primary_color;
  if (r.default_language !== 'fr' && r.default_language !== 'en') r.default_language = 'fr';
  if (!['light', 'dark', 'system'].includes(r.default_theme)) r.default_theme = 'light';
  r.maintenance_message = r.maintenance_message ?? '';
  r.announcement = r.announcement ?? '';
  return r;
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsOwnerId, setPrefsOwnerId] = useState<string | null>(null);
  const [prefsSyncError, setPrefsSyncError] = useState<string | null>(null);
  const prefsRef = useRef<Prefs>(DEFAULT_PREFS);
  const prefsRevision = useRef(0);
  const syncChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const prefsKey = `${PREFS_KEY}.${userId ?? 'guest'}`;

    const applyPrefs = (value: Partial<Prefs>) => {
      const next = { ...DEFAULT_PREFS, ...value };
      prefsRef.current = next;
      setPrefsOwnerId(userId);
      setPrefsState(next);
      void AsyncStorage.setItem(prefsKey, JSON.stringify(next)).catch((error) => {
        console.error('[settings] cache des préférences impossible:', error);
      });
    };

    const loadPreferences = async () => {
      const revision = prefsRevision.current;
      const cached = await AsyncStorage.getItem(prefsKey);
      if (active && cached && revision === prefsRevision.current) {
        try {
          applyPrefs(JSON.parse(cached) as Partial<Prefs>);
        } catch (error) {
          console.error('[settings] cache des préférences illisible:', error);
        }
      }

      if (!userId) return;
      const { data, error } = await supabase
        .from('user_app_preferences')
        .select('theme, language, accent')
        .eq('user_id', userId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error('[settings] synchronisation des préférences impossible:', error.message);
        setPrefsSyncError('Les préférences ne peuvent pas être synchronisées pour le moment.');
        return;
      }
      if (data && revision === prefsRevision.current) applyPrefs(data as Partial<Prefs>);
      if (revision === prefsRevision.current) setPrefsSyncError(null);
    };

    void loadPreferences().catch((error) => {
      if (!active) return;
      console.error('[settings] chargement des préférences impossible:', error);
      setPrefsSyncError('Les préférences ne peuvent pas être synchronisées pour le moment.');
    });

    void AsyncStorage.getItem(CONFIG_KEY).then((cached) => {
      if (!active || !cached) return;
      try {
        setConfig(sanitize(JSON.parse(cached)));
      } catch (error) {
        console.error('[settings] cache de configuration illisible:', error);
      }
    }).catch((error) => {
      console.error('[settings] cache de configuration impossible:', error);
    });

    if (!userId) {
      return () => {
        active = false;
      };
    }

    const channel = supabase
      .channel(`user-preferences-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_app_preferences',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as Partial<Prefs>;
        if (row.theme && row.language && 'accent' in row) {
          prefsRevision.current += 1;
          applyPrefs(row);
          setPrefsSyncError(null);
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[settings] abonnement Realtime des préférences indisponible:', status);
          setPrefsSyncError('La synchronisation en temps réel est indisponible.');
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const applyConfig = useCallback((row: Partial<PlatformConfig> | null | undefined) => {
    if (!row) return;
    setConfig((prev) => {
      const next = sanitize({ ...prev, ...row });
      void AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase.from('admin_platform_settings').select(COLUMNS).maybeSingle();
    applyConfig(data as Partial<PlatformConfig> | null);
  }, [applyConfig]);

  // Temps réel : tout changement fait par l'admin est répercuté immédiatement.
  useEffect(() => {
    // fetchConfig applies state only after the Supabase request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConfig();
    const channel = supabase
      .channel('platform-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_platform_settings' }, (payload) =>
        applyConfig(payload.new as Partial<PlatformConfig>),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void fetchConfig();
      });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void fetchConfig();
    });
    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [fetchConfig, applyConfig]);

  const setPrefs = useCallback(async (patch: Partial<Prefs>) => {
    const base = prefsOwnerId === userId ? prefsRef.current : DEFAULT_PREFS;
    const next = { ...base, ...patch };
    prefsRevision.current += 1;
    prefsRef.current = next;
    setPrefsOwnerId(userId);
    setPrefsState(next);
    const prefsKey = `${PREFS_KEY}.${userId ?? 'guest'}`;
    await AsyncStorage.setItem(prefsKey, JSON.stringify(next));
    if (!userId) return;

    setPrefsSyncError(null);
    const write = syncChain.current.catch(() => undefined).then(async () => {
      const { error } = await supabase.from('user_app_preferences').upsert({
        user_id: userId,
        theme: next.theme,
        language: next.language,
        accent: next.accent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setPrefsSyncError(null);
    });
    syncChain.current = write;
    try {
      await write;
    } catch (error) {
      console.error('[settings] enregistrement des préférences impossible:', error);
      setPrefsSyncError('La préférence est appliquée sur cet appareil, mais sa synchronisation a échoué.');
      throw error;
    }
  }, [prefsOwnerId, userId]);

  const resetPrefs = useCallback(() => setPrefs(DEFAULT_PREFS), [setPrefs]);

  const value = useMemo<SettingsState>(() => {
    const activePrefs = prefsOwnerId === userId ? prefs : DEFAULT_PREFS;
    const themeChoice = activePrefs.theme === 'default' ? config.default_theme : activePrefs.theme;
    const dark = themeChoice === 'dark' || (themeChoice === 'system' && system === 'dark');
    const accent = activePrefs.accent ?? config.app_primary_color;
    const language: Lang = activePrefs.language === 'default' ? config.default_language : activePrefs.language;
    return {
      config,
      prefs: activePrefs,
      dark,
      accent,
      language,
      t: (key) => translate(language, key),
      prefsSyncError,
      setPrefs,
      resetPrefs,
      colors: dark
        ? { bg: '#000000', card: '#1c1c1e', text: '#f2f2f7', muted: '#aeaeb2', border: '#38383a' }
        : { bg: '#f5f5f5', card: '#ffffff', text: '#222222', muted: '#666666', border: '#eeeeee' },
    };
  }, [config, prefs, prefsOwnerId, userId, system, prefsSyncError, setPrefs, resetPrefs]);

  // Appliqué pendant le rendu pour que tous les écrans lisent la bonne palette.
  // eslint-disable-next-line react-hooks/refs -- themedStyles reads this palette during the same render.
  setPalette({ dark: value.dark, accent: value.accent });

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>');
  return ctx;
}
