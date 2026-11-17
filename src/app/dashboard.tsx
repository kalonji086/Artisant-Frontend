import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useUnreadNotificationCount } from '@/hooks/use-unread-notification-count';

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
  const { session, profile, businessAccess, refreshProfile, signOut } = useAuth();
  const theme = useTheme();
  const t = useTranslate();
  const { preferences } = useUserPreferences();
  const unreadNotificationCount = useUnreadNotificationCount();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
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
        setRealtimeConnected(status === 'SUBSCRIBED');
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
  const locale = preferences.language === 'en' ? 'en-US' : 'fr-FR';
  const weeklyActivity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return { date, key, count: 0 };
    });
    const byDay = new Map(days.map((day) => [day.key, day]));

    quotes.forEach((quote) => {
      const date = new Date(quote.created_at);
      if (Number.isNaN(date.getTime())) return;
      const day = byDay.get(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
      if (day) day.count += 1;
    });

    return days;
  }, [quotes]);
  const weeklyMax = Math.max(1, ...weeklyActivity.map((day) => day.count));
  const statusBreakdown = [
    { label: 'Nouvelles demandes', value: pending.length, color: '#F59E0B' },
    { label: 'En cours', value: accepted.length, color: '#3B82F6' },
    { label: 'Terminées', value: count('completed'), color: '#22C55E' },
    { label: 'Refusées', value: count('rejected'), color: '#EF4444' },
  ];
  const statusMax = Math.max(1, ...statusBreakdown.map((item) => item.value));

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
          <TouchableOpacity
            style={[styles.notificationButton, { backgroundColor: theme.backgroundElement }]}
            onPress={() => router.push('/notifications')}
            accessibilityLabel={t('Notifications')}>
            <Ionicons name="notifications-outline" size={21} color={theme.text} />
            {unreadNotificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.availabilityCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <View style={styles.availabilityCopy}>
              <View style={styles.availabilityTitleRow}>
                <View style={[styles.availabilityDot, { backgroundColor: profile?.is_available ? '#22C55E' : theme.textSecondary }]} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Disponibilité')}</Text>
              </View>
              <Text style={[styles.muted, { color: theme.textSecondary }]}>
                {profile?.is_available ? t('Visible par les clients proches') : t('Masqué des recherches')}
              </Text>
            </View>
            <Switch value={!!profile?.is_available} onValueChange={toggleAvailability} />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.businessVerificationCard, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.push('/business-verification')}
          accessibilityRole="button">
          <View style={[styles.businessVerificationIcon, { backgroundColor: `${theme.accent}18` }]}>
            <Ionicons name="business-outline" size={21} color={theme.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {profile?.business_type === 'enterprise'
                ? t('Entreprise vérifiée')
                : profile?.business_type === 'subcontractor'
                  ? t('Sous-traitance vérifiée')
                  : t('Demander un statut entreprise')}
            </Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>
              {t('Suivre ou envoyer une demande de vérification')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>

        <View style={styles.stats}>
          <Stat label="Nouvelles demandes" value={quotes.filter(isNew).length} color="#F5A623" theme={theme} t={t} />
          <Stat label="En cours" value={count('accepted')} color="#007AFF" theme={theme} t={t} />
          <Stat label="Terminées" value={count('completed')} color="#34C759" theme={theme} t={t} />
          <Stat label="Revenus" value={`${revenue.toLocaleString(preferences.language === 'en' ? 'en-US' : 'fr-FR')}`} color="#5856D6" theme={theme} t={t} />
        </View>

        <View style={[styles.chartCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleGroup}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Activité des 7 derniers jours')}</Text>
              <Text style={[styles.chartSubtitle, { color: theme.textSecondary }]}>{t('Nombre de demandes reçues')}</Text>
            </View>
            <View style={styles.liveLabel}>
              <View style={[styles.liveDot, { backgroundColor: realtimeConnected ? '#22C55E' : '#F59E0B' }]} />
              <Text style={[styles.liveText, { color: theme.textSecondary }]}>
                {realtimeConnected ? t('En direct') : t('Hors ligne')}
              </Text>
            </View>
          </View>
          <View style={styles.barChart}>
            {weeklyActivity.map((day) => (
              <View key={day.key} style={styles.barColumn}>
                <Text style={[styles.barValue, { color: theme.textSecondary }]}>{day.count}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.activityBar,
                      {
                        height: `${Math.max(4, (day.count / weeklyMax) * 100)}%`,
                        backgroundColor: theme.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barDay, { color: theme.textSecondary }]}>
                  {day.date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.chartCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Répartition des demandes')}</Text>
          <View style={styles.statusChart}>
            {statusBreakdown.map((item) => (
              <View key={item.label} style={styles.statusRow}>
                <View style={styles.statusLabelRow}>
                  <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>{t(item.label)}</Text>
                  <Text style={[styles.statusValue, { color: theme.text }]}>{item.value}</Text>
                </View>
                <View style={[styles.statusTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[
                      styles.statusBar,
                      { width: `${(item.value / statusMax) * 100}%`, backgroundColor: item.color },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
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
          <QuoteCard key={q.id} quote={q} theme={theme} t={t} locale={locale}>
            <ActionButton label="Accepter" color="#34C759" onPress={() => respond(q.id, 'accept')} t={t} />
            <ActionButton label="Refuser" color="#FF3B30" onPress={() => respond(q.id, 'reject')} t={t} />
            <ActionButton label="Chat" color={theme.accent} onPress={() => openChat(q.id)} t={t} />
          </QuoteCard>
        ))}

        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('Travaux en cours')}</Text>
        {accepted.length === 0 && <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Aucun travail en cours.')}</Text>}
        {accepted.map((q) => (
          <QuoteCard key={q.id} quote={q} theme={theme} t={t} locale={locale}>
            <ActionButton label="Marquer terminé" color={theme.accent} onPress={() => respond(q.id, 'complete')} t={t} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} t={t} />
          </QuoteCard>
        ))}

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
              label="Statut entreprise"
              icon="business-outline"
              onPress={() => {
                setDrawerVisible(false);
                router.push('/business-verification');
              }}
              theme={theme}
              t={t}
            />
            {businessAccess && (
              <DrawerItem
                label="Espace entreprise"
                icon="business-outline"
                onPress={() => {
                  setDrawerVisible(false);
                  router.push('/business');
                }}
                theme={theme}
                t={t}
              />
            )}
            <DrawerItem
              label="Demandes des entreprises"
              icon="briefcase-outline"
              onPress={() => {
                setDrawerVisible(false);
                router.push('/business-jobs');
              }}
              theme={theme}
              t={t}
            />
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
  safe: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1 },
  content: { padding: 16, paddingBottom: 28, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  notificationButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderWidth: 1, borderColor: '#fff' },
  notificationBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  card: { borderRadius: 16, padding: 16, gap: 4 },
  availabilityCard: { borderRadius: 16, padding: 16 },
  businessVerificationCard: { minHeight: 72, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  businessVerificationIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  availabilityCopy: { flex: 1, gap: 5 },
  availabilityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  availabilityDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  muted: { fontSize: 13, lineHeight: 19 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '45%', minHeight: 92, borderRadius: 16, padding: 15, justifyContent: 'center', gap: 3 },
  statValue: { fontSize: 25, fontWeight: '800' },
  statLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  chartCard: { borderRadius: 16, padding: 16, gap: 14 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  chartTitleGroup: { flex: 1 },
  chartSubtitle: { fontSize: 12, marginTop: 4 },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 10, fontWeight: '600' },
  barChart: { height: 144, flexDirection: 'row', alignItems: 'stretch', gap: 7, paddingTop: 4 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  barValue: { fontSize: 10, fontWeight: '600' },
  barTrack: { width: '72%', height: 98, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 7, backgroundColor: '#8b8b8b22' },
  activityBar: { width: '100%', minHeight: 4, borderRadius: 7 },
  barDay: { fontSize: 10, textTransform: 'capitalize' },
  statusChart: { gap: 12, marginTop: 2 },
  statusRow: { gap: 6 },
  statusLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  statusLabel: { fontSize: 12, fontWeight: '500' },
  statusValue: { fontSize: 12, fontWeight: '700' },
  statusTrack: { height: 7, overflow: 'hidden', borderRadius: 4 },
  statusBar: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  action: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  actionText: { color: '#fff', fontWeight: '600' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, marginTop: 4 },
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
