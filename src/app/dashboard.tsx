import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate, useUserPreferences } from '@/lib/user-preferences-context';

type Quote = {
  id: string;
  description: string | null;
  status: 'unassigned' | 'assigned' | 'pending' | 'accepted' | 'rejected' | 'completed';
  price: number | null;
  created_at: string;
  client: { full_name: string | null } | null;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const theme = useTheme();
  const t = useTranslate();
  const { preferences } = useUserPreferences();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const requestsOffset = useRef(0);

  const userId = session?.user.id;

  const loadQuotes = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, description, status, price, created_at, client_id')
        .eq('artisan_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as (Omit<Quote, 'client'> & { client_id: string })[];

      const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
      const { data: profs, error: profileError } = clientIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', clientIds)
        : { data: [], error: null };
      if (profileError) throw profileError;

      const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
      setQuotes(rows.map((r) => ({ ...r, client: byId.get(r.client_id) ?? null })) as Quote[]);
    } catch (error) {
      console.error('[dashboard] Chargement des demandes impossible:', error);
      setLoadError(error instanceof Error ? error.message : 'Impossible de charger les demandes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    // loadQuotes writes state after its database requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadQuotes();
    if (!userId) return;
    // Nouveau devis assigné par l'Admin : la liste se met à jour toute seule.
    const channel = supabase
      .channel(`artisan-quotes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `artisan_id=eq.${userId}` }, () => loadQuotes())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[dashboard] Synchronisation des demandes indisponible:', status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadQuotes, userId]);

  const toggleAvailability = async (value: boolean) => {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ is_available: value }).eq('id', userId);
    if (error) Alert.alert('Erreur', error.message);
    else await refreshProfile();
  };

  const respond = async (id: string, action: 'accept' | 'reject' | 'complete') => {
    const { error } = await supabase.rpc('artisan_respond_to_quote', { p_quote_id: id, p_action: action });
    if (error) Alert.alert('Erreur', error.message);
    else loadQuotes();
  };

  const openChat = async (quoteId: string) => {
    const { data, error } = await supabase.rpc('start_quote_chat', { p_quote_id: quoteId });
    if (error || !data) return Alert.alert('Chat indisponible', error?.message ?? 'Réessayez plus tard.');
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const isNew = (q: Quote) => q.status === 'assigned' || q.status === 'pending';
  const count = (s: Quote['status']) => quotes.filter((q) => q.status === s).length;
  const revenue = quotes
    .filter((q) => q.status === 'completed')
    .reduce((sum, q) => sum + Number(q.price ?? 0), 0);
  const pending = quotes.filter(isNew);
  const accepted = quotes.filter((q) => q.status === 'accepted');

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" style={styles.center} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadQuotes();
            }}
          />
        }>
        <View style={styles.header}>
          <TouchableOpacity style={[styles.menuButton, { backgroundColor: theme.backgroundElement }]} onPress={() => setDrawerVisible(true)} accessibilityLabel={t('Ouvrir le menu')}>
            <Ionicons name="menu-outline" size={23} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.center}>
            <Text style={[styles.title, { color: theme.text }]}>{t('Tableau de bord')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {profile?.full_name ?? t('Artisan')}
              {profile?.profession ? ` · ${profile.profession}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={[styles.homeButton, { borderColor: theme.accent }]} onPress={() => router.push('/settings')} accessibilityLabel={t('Paramètres')}>
            <Ionicons name="settings-outline" size={19} color={theme.accent} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <View style={styles.center}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Disponibilité')}</Text>
              <Text style={[styles.muted, { color: theme.textSecondary }]}>
                {profile?.is_available ? t('Visible par les clients proches') : t('Masqué des recherches')}
              </Text>
            </View>
            <Switch value={!!profile?.is_available} onValueChange={toggleAvailability} />
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="Nouvelles demandes" value={quotes.filter(isNew).length} color="#F5A623" theme={theme} t={t} />
          <Stat label="En cours" value={count('accepted')} color="#007AFF" theme={theme} t={t} />
          <Stat label="Terminées" value={count('completed')} color="#34C759" theme={theme} t={t} />
          <Stat label="Revenus" value={`${revenue.toLocaleString(preferences.language === 'en' ? 'en-US' : 'fr-FR')}`} color="#5856D6" theme={theme} t={t} />
        </View>

        <Text
          style={[styles.sectionTitle, { color: theme.text }]}
          onLayout={(event) => {
            requestsOffset.current = event.nativeEvent.layout.y;
          }}>
          {t('Demandes assignées par l’Admin')}
        </Text>
        {!!loadError && <Text style={styles.error}>{loadError}</Text>}
        {pending.length === 0 && <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Aucune nouvelle demande.')}</Text>}
        {pending.map((q) => (
          <QuoteCard key={q.id} quote={q} theme={theme} t={t} locale={preferences.language === 'en' ? 'en-US' : 'fr-FR'}>
            <ActionButton label="Accepter" color="#34C759" onPress={() => respond(q.id, 'accept')} t={t} />
            <ActionButton label="Refuser" color="#FF3B30" onPress={() => respond(q.id, 'reject')} t={t} />
            <ActionButton label="Chat" color={theme.accent} onPress={() => openChat(q.id)} t={t} />
          </QuoteCard>
        ))}

        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('Travaux en cours')}</Text>
        {accepted.length === 0 && <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Aucun travail en cours.')}</Text>}
        {accepted.map((q) => (
          <QuoteCard key={q.id} quote={q} theme={theme} t={t} locale={preferences.language === 'en' ? 'en-US' : 'fr-FR'}>
            <ActionButton label="Marquer terminé" color={theme.accent} onPress={() => respond(q.id, 'complete')} t={t} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} t={t} />
          </QuoteCard>
        ))}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Mon profil')}</Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Téléphone')} : {profile?.phone ?? t('Non renseigné')}</Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Ville')} : {profile?.city ?? t('Non renseignée')}</Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Note')} : {Number(profile?.rating ?? 0).toFixed(1)} / 5</Text>
          {!!profile?.description && <Text style={[styles.muted, { color: theme.textSecondary }]}>{profile.description}</Text>}
        </View>

        <TouchableOpacity style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          <Text style={styles.logoutText}>{t('Se déconnecter')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerVisible(false)} />
          <View style={[styles.drawerPanel, { backgroundColor: theme.background }]}>
              <View style={[styles.drawerHeader, { borderBottomColor: theme.backgroundSelected }]}>
              <View style={styles.drawerAvatar}>
                <Text style={styles.drawerAvatarText}>
                  {(profile?.full_name?.trim().charAt(0) || 'A').toUpperCase()}
                </Text>
              </View>
              <View style={styles.center}>
                <Text style={[styles.drawerName, { color: theme.text }]}>{profile?.full_name ?? t('Artisan')}</Text>
                <Text style={[styles.muted, { color: theme.textSecondary }]}>{profile?.profession ?? t('Espace artisan')}</Text>
              </View>
              <TouchableOpacity onPress={() => setDrawerVisible(false)} hitSlop={10} accessibilityLabel={t('Fermer le menu')}>
                <Ionicons name="close" size={23} color="#667085" />
              </TouchableOpacity>
            </View>
            <Text style={styles.drawerSection}>{t('ESPACE ARTISAN')}</Text>
            <DrawerItem
              label="Demandes reçues"
              icon="briefcase-outline"
              onPress={() => {
                setDrawerVisible(false);
                scrollRef.current?.scrollTo({ y: requestsOffset.current, animated: true });
              }}
              theme={theme}
              t={t}
            />
            <DrawerItem label="Messages" icon="chatbubbles-outline" onPress={() => { setDrawerVisible(false); router.push('/messages'); }} theme={theme} t={t} />
            <DrawerItem label="Notifications" icon="notifications-outline" onPress={() => { setDrawerVisible(false); router.push('/notifications'); }} theme={theme} t={t} />
            <DrawerItem label="Accueil et carte" icon="map-outline" onPress={() => { setDrawerVisible(false); router.push('/'); }} theme={theme} t={t} />
            <DrawerItem label="Mon profil" icon="person-outline" onPress={() => { setDrawerVisible(false); router.push('/profile'); }} theme={theme} t={t} />
            <DrawerItem label="Paramètres" icon="settings-outline" onPress={() => { setDrawerVisible(false); router.push('/settings'); }} theme={theme} t={t} />
            <View style={styles.drawerSpacer} />
            <DrawerItem label="Se déconnecter" icon="log-out-outline" destructive onPress={signOut} theme={theme} t={t} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DrawerItem({
  label,
  icon,
  onPress,
  destructive = false,
  theme,
  t,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
}) {
  const color = destructive ? '#d92d20' : '#344054';
  return (
    <TouchableOpacity style={styles.drawerItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={destructive ? color : theme.accent} />
      <Text style={[styles.drawerItemText, { color: destructive ? color : theme.text }]}>{t(label)}</Text>
      {!destructive && <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
    </TouchableOpacity>
  );
}

function Stat({ label, value, color, theme, t }: {
  label: string;
  value: number | string;
  color: string;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t(label)}</Text>
    </View>
  );
}

function QuoteCard({
  quote,
  children,
  theme,
  t,
  locale,
}: {
  quote: Quote;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
  locale: string;
}) {
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{quote.client?.full_name ?? t('Client')}</Text>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>{quote.description ?? t('Sans description')}</Text>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>{new Date(quote.created_at).toLocaleDateString(locale)}</Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function ActionButton(props: { label: string; color: string; onPress: () => void; t: (text: string) => string }) {
  return (
    <TouchableOpacity style={[styles.action, { backgroundColor: props.color }]} onPress={props.onPress}>
      <Text style={styles.actionText}>{props.t(props.label)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1 },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#222' },
  subtitle: { fontSize: 14, color: '#666' },
  homeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#007AFF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  homeButtonText: { color: '#007AFF', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#222' },
  muted: { fontSize: 14, color: '#666' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 13, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionText: { color: '#fff', fontWeight: '600' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
  logoutText: { color: '#FF3B30', fontWeight: '600' },
  error: { color: '#b42318', backgroundColor: '#fef3f2', borderRadius: 8, padding: 10, fontSize: 13 },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(16, 24, 40, 0.45)' },
  drawerBackdrop: { ...StyleSheet.absoluteFill },
  drawerPanel: { width: '82%', maxWidth: 340, height: '100%', backgroundColor: '#fff', paddingTop: 54, paddingHorizontal: 16, paddingBottom: 20 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eaecf0' },
  drawerAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1877F2' },
  drawerAvatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  drawerName: { color: '#101828', fontSize: 15, fontWeight: '800' },
  drawerSection: { color: '#98a2b3', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 22, marginBottom: 8 },
  drawerItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderRadius: 10 },
  drawerItemText: { flex: 1, fontSize: 14, fontWeight: '600' },
  drawerSpacer: { flex: 1 },
});
