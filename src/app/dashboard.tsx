import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
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
import { useResponsive } from '@/lib/responsive';
import { useAuth } from '@/lib/auth-context';
import { INPUT_PROPS } from '@/lib/input-colors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotificationBell } from '@/components/notification-bell';

type Quote = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  status: 'unassigned' | 'assigned' | 'pending' | 'accepted' | 'in_progress' | 'rejected' | 'completed' | 'quote_sent';
  price: number | null;
  created_at: string;
  client_id: string | null;
  client: { full_name: string | null } | null;
};

export default function DashboardScreen() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}

function DashboardContent() {
  const { accent, t } = useSettings();
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const responsive = useResponsive();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, title, category, description, status, price, created_at, client_id')
        .eq('artisan_id', userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[dashboard] chargement des demandes impossible:', error.message);
        return;
      }
      const rows = (data ?? []) as (Omit<Quote, 'client'> & { client_id: string | null })[];

      const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter((id): id is string => !!id)));
      const { data: profs, error: profilesError } = clientIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', clientIds)
        : { data: [], error: null };
      if (profilesError) {
        console.error('[dashboard] chargement des noms clients impossible:', profilesError.message);
      }
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
      setQuotes(rows.map((r) => ({ ...r, client: r.client_id ? (byId.get(r.client_id) ?? null) : null })) as Quote[]);
    } catch (error) {
      console.error('[dashboard] erreur inattendue pendant le chargement:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    // loadQuotes updates state only after its asynchronous database requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQuotes();
    if (!userId) return;
    // Nouveau devis assigné par l'Admin : la liste se met à jour toute seule.
    const channel = supabase
      .channel(`artisan-quotes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `artisan_id=eq.${userId}` }, () => loadQuotes())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadQuotes, userId]);

  const togglePhonePublic = async (value: boolean) => {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ phone_public: value }).eq('id', userId);
    if (error) Alert.alert('Erreur', error.message);
    else await refreshProfile();
  };

  const toggleAvailability = async (value: boolean) => {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update({ is_available: value }).eq('id', userId);
    if (error) Alert.alert('Erreur', error.message);
    else await refreshProfile();
  };

  const [pendingAction, setPendingAction] = useState<{ quote: Quote; action: 'accept' | 'reject' | 'start' | 'complete' } | null>(null);
  const [comment, setComment] = useState('');
  const [priceText, setPriceText] = useState('');
  const [saving, setSaving] = useState(false);

  const askRespond = (quote: Quote, action: 'accept' | 'reject' | 'start' | 'complete') => {
    setComment('');
    setPriceText(quote.price != null ? String(quote.price) : '');
    setPendingAction({ quote, action });
  };

  const confirmRespond = async () => {
    if (!pendingAction) return;
    const price = priceText.trim() ? Number(priceText.replace(',', '.')) : null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return Alert.alert('Prix invalide', 'Entrez un montant valide ou laissez vide.');
    }
    setSaving(true);
    const { error } = await supabase.rpc('artisan_respond_to_quote', {
      p_quote_id: pendingAction.quote.id,
      p_action: pendingAction.action,
      p_price: pendingAction.action === 'accept' || pendingAction.action === 'complete' ? price : null,
      p_comment: comment.trim() || null,
    });
    setSaving(false);
    if (error) return Alert.alert('Erreur', error.message);
    setPendingAction(null);
    loadQuotes();
  };
  const openChat = async (quoteId: string) => {
    const { data, error } = await supabase.rpc('start_quote_chat', { p_quote_id: quoteId });
    if (error || !data) return Alert.alert('Chat indisponible', error?.message ?? 'Réessayez plus tard.');
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const sendExploitReply = async (quote: Quote) => {
    const { data, error } = await supabase.rpc('start_quote_chat', { p_quote_id: quote.id });
    if (error || !data) {
      Alert.alert('Réponse impossible', error?.message ?? 'Le chat n’a pas pu être ouvert.');
      return;
    }

    const convId = (data as { id: string }).id;
    const reply = `Bonjour ${quote.client?.full_name ?? 'Client'}, votre demande a bien été prise en compte. Une réponse détaillée vous sera envoyée par email et vous pourrez la suivre depuis l’application.`;
    const { error: sendError } = await supabase.rpc('send_chat_message', { p_conversation_id: convId, p_content: reply });
    if (sendError) {
      Alert.alert('Notification envoyée', 'Le message est visible dans l’application, mais l’email Brevo doit être branché côté backend.');
      router.push({ pathname: '/messages', params: { c: convId } });
      return;
    }

    Alert.alert('Réponse envoyée', 'La réponse a été transmise au client dans l’application et le mail peut être déclenché côté serveur via Brevo.');
    router.push({ pathname: '/messages', params: { c: convId } });
  };

  const isNew = (q: Quote) => q.status === 'assigned' || q.status === 'pending';
  const count = (s: Quote['status']) => quotes.filter((q) => q.status === s).length;
  const revenue = quotes
    .filter((q) => q.status === 'completed')
    .reduce((sum, q) => sum + Number(q.price ?? 0), 0);
  const pending = quotes.filter(isNew);
  const accepted = quotes.filter((q) => q.status === 'accepted' || q.status === 'in_progress');
  const sentQuotes = quotes.filter((q) => q.status === 'quote_sent');
  const exploitQueue = quotes.filter((q) => q.status === 'pending' || q.status === 'accepted');
  const weeklyActivity = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const count = quotes.filter((quote) => {
        const created = new Date(quote.created_at);
        return (
          created.getFullYear() === date.getFullYear() &&
          created.getMonth() === date.getMonth() &&
          created.getDate() === date.getDate()
        );
      }).length;
      const weekdays = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
      return { key, label: weekdays[date.getDay()], count };
    });
    return days;
  }, [quotes]);
  const maxDailyQuotes = Math.max(1, ...weeklyActivity.map((day) => day.count));
  const drawerItems: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    href?: '/messages' | '/notifications' | '/' | '/profile' | '/settings' | '/portfolio';
    section?: 'requests';
  }[] = [
    { label: 'Demandes reçues', icon: 'briefcase-outline', section: 'requests' },
    { label: 'Mes réalisations', icon: 'images-outline', href: '/portfolio' },
    { label: 'Messages', icon: 'chatbubbles-outline', href: '/messages' },
    { label: 'Notifications', icon: 'notifications-outline', href: '/notifications' },
    { label: 'Accueil et carte', icon: 'map-outline', href: '/' },
    { label: 'Mon profil', icon: 'person-outline', href: '/profile' },
    { label: 'Paramètres', icon: 'settings-outline', href: '/settings' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" style={styles.center} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { padding: responsive.gutter }, responsive.contentFrame]}
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
          <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerVisible(true)} accessibilityLabel="Ouvrir le menu">
            <Ionicons name="menu-outline" size={23} color={accent} />
          </TouchableOpacity>
          <View style={[styles.center, styles.headerIdentity]}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>
              {profile?.full_name ?? 'Artisan'}
              {profile?.profession ? ` · ${profile.profession}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.homeButton} onPress={() => router.push('/settings')} accessibilityLabel={t('settings.title')}>
            <Ionicons name="settings-outline" size={16} color={accent} />
          </TouchableOpacity>
          {session && <NotificationBell />}
          <TouchableOpacity style={styles.homeButton} onPress={() => router.push('/')}>
            <Ionicons name="home-outline" size={16} color={accent} />
            <Text style={styles.homeButtonText}>Accueil</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.center}>
              <Text style={styles.cardTitle}>Disponibilité</Text>
              <Text style={styles.muted}>
                {profile?.is_available ? 'Visible par les clients proches' : 'Masqué des recherches'}
              </Text>
            </View>
            <Switch value={!!profile?.is_available} onValueChange={toggleAvailability} />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.center}>
              <Text style={styles.cardTitle}>Afficher mon téléphone</Text>
              <Text style={styles.muted}>
                {profile?.phone_public ? 'Les clients voient votre numéro sur votre fiche' : 'Votre numéro reste privé'}
              </Text>
            </View>
            <Switch value={!!profile?.phone_public} onValueChange={togglePhonePublic} />
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="Nouvelles demandes" value={quotes.filter(isNew).length} color="#F5A623" />
          <Stat label="En cours" value={count('accepted') + count('in_progress')} color="#007AFF" />
          <Stat label="Terminées" value={count('completed')} color="#34C759" />
          <Stat label="Revenus" value={formatAmount(revenue)} color="#5856D6" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Activité des 7 derniers jours</Text>
          <Text style={styles.muted}>Demandes reçues · mises à jour en temps réel</Text>
          <View style={styles.chart}>
            {weeklyActivity.map((day) => (
              <View key={day.key} style={styles.chartDay}>
                <Text style={styles.chartCount}>{day.count}</Text>
                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: `${day.count === 0 ? 3 : Math.max(12, (day.count / maxDailyQuotes) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{day.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.chartCaption}>
            {weeklyActivity.reduce((sum, day) => sum + day.count, 0)} demande
            {weeklyActivity.reduce((sum, day) => sum + day.count, 0) > 1 ? 's' : ''} sur cette période
          </Text>
        </View>

        <Text
          style={styles.sectionTitle}
          onLayout={(event) => {
            requestsOffset.current = event.nativeEvent.layout.y;
          }}>
          Exploits / demandes directes
        </Text>
        {exploitQueue.length === 0 && <Text style={styles.muted}>Aucune demande d’exploit.</Text>}
        {exploitQueue.map((q) => (
          <QuoteCard key={q.id} quote={q}>
            <ActionButton label="Répondre" color="#34C759" onPress={() => sendExploitReply(q)} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} />
          </QuoteCard>
        ))}

        <Text style={styles.sectionTitle}>Demandes assignées par l&apos;Admin</Text>
        {pending.length === 0 && <Text style={styles.muted}>Aucune nouvelle demande.</Text>}
        {pending.map((q) => (
          <QuoteCard key={q.id} quote={q}>
            <ActionButton label="Rédiger le devis" color="#007AFF" onPress={() => router.push({ pathname: '/proposal', params: { id: q.id } })} />
            <ActionButton label="Accepter" color="#34C759" onPress={() => askRespond(q, 'accept')} />
            <ActionButton label="Rejeter" color="#FF3B30" onPress={() => askRespond(q, 'reject')} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} />
          </QuoteCard>
        ))}

        <Text style={styles.sectionTitle}>Travaux en cours</Text>
        {accepted.length === 0 && <Text style={styles.muted}>Aucun travail en cours.</Text>}
        {accepted.map((q) => (
          <QuoteCard key={q.id} quote={q}>
            <ActionButton label="Rédiger le devis" color="#007AFF" onPress={() => router.push({ pathname: '/proposal', params: { id: q.id } })} />
            {q.status === 'accepted' && <ActionButton label="Mettre en cours" color="#FF9500" onPress={() => askRespond(q, 'start')} />}
            <ActionButton label="Marquer terminé" color="#007AFF" onPress={() => askRespond(q, 'complete')} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} />
          </QuoteCard>
        ))}

        <Text style={styles.sectionTitle}>Devis envoyés</Text>
        {sentQuotes.length === 0 && <Text style={styles.muted}>Aucun devis envoyé pour le moment.</Text>}
        {sentQuotes.map((q) => (
          <QuoteCard key={q.id} quote={q}>
            <Text style={styles.sentNote}>Le devis a été envoyé par email au client.</Text>
          </QuoteCard>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mon profil</Text>
          <Text style={styles.muted}>Téléphone : {profile?.phone ?? 'Non renseigné'}</Text>
          <Text style={styles.muted}>Ville : {profile?.city ?? 'Non renseignée'}</Text>
          <Text style={styles.muted}>Note : {Number(profile?.rating ?? 0).toFixed(1)} / 5</Text>
          {!!profile?.description && <Text style={styles.muted}>{profile.description}</Text>}
        </View>

        <TouchableOpacity style={styles.logout} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={18} color={accent} />
          <Text style={[styles.logoutText, { color: accent }]}>{t('profile.settings')}</Text>
        </TouchableOpacity>

      </ScrollView>
      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerVisible(false)} />
          <View style={styles.drawerPanel}>
            <View style={styles.drawerHeader}>
              <View style={[styles.drawerAvatar, { backgroundColor: accent }]}>
                <Text style={styles.drawerAvatarText}>
                  {(profile?.full_name?.trim().charAt(0) || 'A').toUpperCase()}
                </Text>
              </View>
              <View style={styles.center}>
                <Text style={styles.drawerName}>{profile?.full_name ?? 'Artisan'}</Text>
                <Text style={styles.drawerProfession}>{profile?.profession ?? 'Espace artisan'}</Text>
              </View>
              <TouchableOpacity onPress={() => setDrawerVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={23} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.drawerSection}>ESPACE ARTISAN</Text>
            {drawerItems.map((item) => (
              <TouchableOpacity
                key={`${item.href}-${item.label}`}
                style={[styles.drawerItem, item.section === 'requests' && styles.drawerDivider]}
                onPress={() => {
                  setDrawerVisible(false);
                  if (item.section === 'requests') {
                    scrollRef.current?.scrollTo({ y: requestsOffset.current, animated: true });
                  } else if (item.href) {
                    router.push(item.href);
                  }
                }}>
                <Ionicons name={item.icon} size={20} color={accent} />
                <Text style={styles.drawerItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color="#9a9a9a" />
              </TouchableOpacity>
            ))}
            <View style={styles.drawerFooter}>
              <Text style={styles.drawerFooterText}>Artisants · Espace professionnel</Text>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!pendingAction} transparent animationType="slide" onRequestClose={() => setPendingAction(null)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>
              {pendingAction?.action === 'accept' ? 'Accepter la demande' : pendingAction?.action === 'reject' ? 'Rejeter la demande' : pendingAction?.action === 'start' ? 'Mettre en cours' : 'Marquer comme terminé'}
            </Text>
            {(pendingAction?.action === 'accept' || pendingAction?.action === 'complete') && (
              <TextInput {...INPUT_PROPS} style={styles.modalInput} placeholder="Prix estimatif (optionnel)" placeholderTextColor="#999" value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" maxLength={12} />
            )}
            <TextInput {...INPUT_PROPS} style={[styles.modalInput, { minHeight: 90, textAlignVertical: 'top' }]} placeholder="Commentaire pour le client (optionnel)" placeholderTextColor="#999" value={comment} onChangeText={setComment} multiline maxLength={1000} />
            <View style={styles.actions}>
              <ActionButton label="Annuler" color="#8E8E93" onPress={() => setPendingAction(null)} />
              <ActionButton label={saving ? '...' : 'Confirmer'} color="#007AFF" onPress={confirmRespond} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuoteCard({ quote, children }: { quote: Quote; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{quote.title ?? quote.category ?? 'Demande'}</Text>
      <Text style={styles.metaLabel}>{quote.category ?? 'Sans catégorie'}</Text>
      <Text style={styles.muted}>{quote.client?.full_name ?? 'Client'}</Text>
      <Text style={styles.muted}>{quote.description ?? 'Sans description'}</Text>
      <Text style={styles.muted}>{formatDate(quote.created_at)}</Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date inconnue';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return '0';
  const [integer, decimal] = String(value).split('.');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decimal ? `${groupedInteger},${decimal}` : groupedInteger;
}

function ActionButton(props: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.action, { backgroundColor: props.color }]} onPress={props.onPress}>
      <Text style={styles.actionText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = themedStyles({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1 },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuButton: { width: 40, height: 40, borderWidth: 1, borderColor: '#007AFF', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  headerIdentity: { minWidth: 0 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#222' },
  subtitle: { fontSize: 14, color: '#666' },
  homeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#007AFF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  homeButtonText: { color: '#007AFF', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#222' },
  metaLabel: { fontSize: 12, color: '#007AFF', fontWeight: '600', marginBottom: 2 },
  muted: { fontSize: 14, color: '#666' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 13, color: '#666', marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 142, marginTop: 12 },
  chartDay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5, height: '100%' },
  chartCount: { color: '#666', fontSize: 11, fontWeight: '600' },
  chartBarTrack: { width: '100%', maxWidth: 28, height: 100, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 7, backgroundColor: '#eef3fa' },
  chartBar: { width: '100%', minHeight: 3, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: '#007AFF' },
  chartLabel: { color: '#666', fontSize: 10, textTransform: 'capitalize' },
  chartCaption: { color: '#555', fontSize: 12, marginTop: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginTop: 8 },
  sentNote: { color: '#26713c', fontSize: 13, fontWeight: '600', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionText: { color: '#fff', fontWeight: '600' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, fontSize: 15, color: '#222', backgroundColor: '#fff' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
  logoutText: { color: '#FF3B30', fontWeight: '600' },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: '#0005' },
  drawerBackdrop: { ...StyleSheet.absoluteFill },
  drawerPanel: { width: '82%', maxWidth: 320, height: '100%', backgroundColor: '#fff', paddingHorizontal: 18, paddingTop: 58, paddingBottom: 20, elevation: 18, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  drawerAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  drawerAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  drawerName: { color: '#222', fontWeight: '700', fontSize: 15 },
  drawerProfession: { color: '#777', fontSize: 12, marginTop: 3 },
  drawerSection: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 22, marginBottom: 9 },
  drawerItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderRadius: 10 },
  drawerDivider: { marginBottom: 10 },
  drawerItemText: { flex: 1, color: '#303030', fontSize: 14, fontWeight: '600' },
  drawerFooter: { flex: 1, justifyContent: 'flex-end', paddingTop: 20 },
  drawerFooterText: { color: '#999', fontSize: 11, textAlign: 'center' },
});
