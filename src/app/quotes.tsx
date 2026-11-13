import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { useResponsive } from '@/lib/responsive';
import { getCurrentCoords } from '@/lib/location';
import { PROFESSIONS } from '@/lib/professions';
import { errorMessage } from '@/lib/errors';
import { INPUT_PROPS } from '@/lib/input-colors';

type Status = 'unassigned' | 'assigned' | 'pending' | 'accepted' | 'in_progress' | 'rejected' | 'completed' | 'quote_sent';

type MyQuote = {
  id: string;
  title: string | null;
  category: string | null;
  description: string | null;
  urgency: 'flexible' | 'normal' | 'urgent' | null;
  address: string | null;
  budget: number | null;
  status: Status;
  price: number | null;
  assigned_at: string | null;
  artisan_comment: string | null;
  created_at: string;
  artisan_id: string | null;
  artisan: { full_name: string | null; phone: string | null; profession: string | null } | null;
};

const STATUS_LABEL: Record<Status, { text: string; color: string }> = {
  unassigned: { text: 'En attente d’un artisan', color: '#F5A623' },
  assigned: { text: 'Attribuée', color: '#5856D6' },
  pending: { text: 'Attribuée · en attente de réponse', color: '#5856D6' },
  accepted: { text: 'Acceptée', color: '#34C759' },
  in_progress: { text: 'En cours', color: '#FF9500' },
  rejected: { text: 'Refusée', color: '#FF3B30' },
  completed: { text: 'Terminée', color: '#007AFF' },
  quote_sent: { text: 'Devis envoyé par email', color: '#34C759' },
};

const URGENCIES = [
  { key: 'flexible', label: 'Flexible' },
  { key: 'normal', label: 'Normale' },
  { key: 'urgent', label: 'Urgente' },
] as const;

type Tab = 'all' | 'waiting' | 'assigned';

export default function MyQuotesScreen() {
  useSettings();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; title?: string; artisanId?: string }>();
  const { session } = useAuth();
  const responsive = useResponsive();
  const userId = session?.user.id;
  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]['key']>('normal');
  const [address, setAddress] = useState('');
  const [budget, setBudget] = useState('');
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [quotes, setQuotes] = useState<MyQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [reviews, setReviews] = useState<Record<string, { rating: number; comment: string | null }>>({});
  const [rateQuote, setRateQuote] = useState<MyQuote | null>(null);
  const [stars, setStars] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setQuotes([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, title, category, description, urgency, address, budget, status, price, assigned_at, artisan_comment, created_at, artisan_id')
        .eq('client_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Omit<MyQuote, 'artisan'>[];

      const artisanIds = Array.from(new Set(rows.map((r) => r.artisan_id).filter((id): id is string => !!id)));
      const { data: profs, error: profilesError } = artisanIds.length
        ? await supabase.from('profiles').select('id, full_name, phone, profession').in('id', artisanIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
      setQuotes(rows.map((r) => ({ ...r, artisan: r.artisan_id ? (byId.get(r.artisan_id) ?? null) : null })) as MyQuote[]);

      const { data: revs, error: reviewsError } = await supabase
        .from('reviews')
        .select('quote_id, rating, comment')
        .eq('client_id', userId);
      if (reviewsError) throw reviewsError;
      setReviews(Object.fromEntries((revs ?? []).map((r) => [r.quote_id as string, { rating: r.rating as number, comment: r.comment as string | null }])));
    } catch (err) {
      console.error('[quotes] chargement des demandes impossible:', err);
      setLoadError(errorMessage(err, 'Impossible de charger vos demandes. Réessayez.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    const nextCategory = typeof params.category === 'string' ? params.category : null;
    const nextTitle = typeof params.title === 'string' ? params.title : '';
    // Route parameters prefill the form when navigation reuses this screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nextCategory) setCategory(nextCategory);
    if (nextTitle) setTitle(nextTitle);
  }, [params.category, params.title]);

  useEffect(() => {
    // load updates state only after its asynchronous database requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!userId) return;
    const channel = supabase
      .channel(`my-quotes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `client_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const visible = useMemo(
    () =>
      quotes.filter((q) =>
        tab === 'all'
          ? true
          : tab === 'waiting'
            ? q.status === 'unassigned'
            : q.status !== 'unassigned',
      ),
    [quotes, tab],
  );
  const waitingCount = quotes.filter((q) => q.status === 'unassigned').length;
  const assignedCount = quotes.length - waitingCount;

  const send = async () => {
    if (!category) return Alert.alert('Catégorie requise', 'Choisissez le type de service.');
    if (description.trim().length < 10) return Alert.alert('Description trop courte', 'Décrivez votre besoin (10 caractères minimum).');
    const budgetValue = budget.trim() ? Number(budget.replace(',', '.')) : null;
    if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)) {
      return Alert.alert('Budget invalide', 'Entrez un montant valide ou laissez vide.');
    }
    setSending(true);
    try {
      const coords = await getCurrentCoords().catch(() => null);
      const targetArtisanId = typeof params.artisanId === 'string' && params.artisanId ? params.artisanId : null;
      const { data: createdQuote, error } = targetArtisanId
        ? await supabase.rpc('create_direct_quote', {
            p_artisan_id: targetArtisanId,
            p_description: description.trim(),
            p_category: category,
            p_title: title.trim() || null,
          })
        : await supabase.rpc('create_quote_request', {
            p_description: description.trim(),
            p_latitude: coords?.latitude ?? null,
            p_longitude: coords?.longitude ?? null,
            p_category: category,
            p_title: title.trim() || null,
            p_urgency: urgency,
            p_address: address.trim() || null,
            p_budget: budgetValue,
          });
      if (error) throw error;
      if (!createdQuote) throw new Error('La demande n’a pas été confirmée par le serveur.');

      setCategory(null);
      setTitle('');
      setDescription('');
      setUrgency('normal');
      setAddress('');
      setBudget('');
      setShowForm(false);
      setTab('all');
      await load();
      Alert.alert('Demande envoyée', 'Elle est en attente : l’équipe va l’attribuer à l’artisan le plus adapté.');
    } catch (err) {
      Alert.alert('Envoi impossible', errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const openChat = async (quoteId: string) => {
    const { data, error } = await supabase.rpc('start_quote_chat', { p_quote_id: quoteId });
    if (error || !data) return Alert.alert('Chat indisponible', errorMessage(error, 'Réessayez plus tard.'));
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const openRate = (q: MyQuote) => {
    const existing = reviews[q.id];
    setStars(existing?.rating ?? 5);
    setReviewText(existing?.comment ?? '');
    setRateQuote(q);
  };

  const submitReview = async () => {
    if (!rateQuote) return;
    setSavingReview(true);
    const { error } = await supabase.rpc('submit_review', { p_quote_id: rateQuote.id, p_rating: stars, p_comment: reviewText.trim() || null });
    setSavingReview(false);
    if (error) return Alert.alert('Avis impossible', errorMessage(error));
    setRateQuote(null);
    Alert.alert('Merci !', 'Votre avis a été publié.');
    load();
  };

  const openSupport = async () => {
    const { data, error } = await supabase.rpc('start_support_chat');
    if (error || !data) return Alert.alert('Chat indisponible', errorMessage(error, 'Réessayez plus tard.'));
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: `Toutes (${quotes.length})` },
    { key: 'waiting', label: `En attente (${waitingCount})` },
    { key: 'assigned', label: `Attribuées (${assignedCount})` },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={visible}
          keyExtractor={(q) => q.id}
          contentContainerStyle={[styles.content, { padding: responsive.gutter }, responsive.contentFrame]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListHeaderComponent={
            <View style={styles.form}>
              {showForm ? (
                <>
              <Text style={styles.title}>{typeof params.title === 'string' && params.title ? 'Demander un devis à cet artisan' : 'Demander un devis'}</Text>

              <Text style={styles.label}>Catégorie *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {PROFESSIONS.map((p) => (
                  <TouchableOpacity key={p} style={[styles.chip, category === p && styles.chipActive]} onPress={() => setCategory(p)}>
                    <Text style={[styles.chipText, category === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Titre</Text>
              <TextInput {...INPUT_PROPS} style={styles.field} placeholder="Ex : Fuite sous l’évier" placeholderTextColor="#999" value={title} onChangeText={setTitle} maxLength={120} />

              <Text style={styles.label}>Description *</Text>
              <TextInput
                {...INPUT_PROPS}
                style={[styles.field, styles.multiline]}
                placeholder="Décrivez précisément votre besoin"
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={1000}
              />

              <Text style={styles.label}>Urgence</Text>
              <View style={styles.chips}>
                {URGENCIES.map((u) => (
                  <TouchableOpacity key={u.key} style={[styles.chip, urgency === u.key && styles.chipActive]} onPress={() => setUrgency(u.key)}>
                    <Text style={[styles.chipText, urgency === u.key && styles.chipTextActive]}>{u.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Adresse d’intervention</Text>
              <TextInput {...INPUT_PROPS} style={styles.field} placeholder="Quartier, rue, ville" placeholderTextColor="#999" value={address} onChangeText={setAddress} maxLength={250} />

              <Text style={styles.label}>Budget estimé (optionnel)</Text>
              <TextInput {...INPUT_PROPS} style={styles.field} placeholder="Montant" placeholderTextColor="#999" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" maxLength={12} />

              <TouchableOpacity style={[styles.send, sending && styles.disabled]} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Envoyer la demande</Text>}
              </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.newRequest} onPress={() => setShowForm(true)}>
                  <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                  <Text style={styles.newRequestText}>Créer une nouvelle demande</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.support} onPress={openSupport}>
                <Ionicons name="chatbubbles-outline" size={18} color="#007AFF" />
                <Text style={styles.supportText}>Discuter avec Artisant (support)</Text>
              </TouchableOpacity>

              <Text style={[styles.title, styles.listTitle]}>Mes demandes</Text>
              <View style={styles.chips}>
                {tabs.map((t) => (
                  <TouchableOpacity key={t.key} style={[styles.chip, tab === t.key && styles.chipActive]} onPress={() => setTab(t.key)}>
                    <Text style={[styles.chipText, tab === t.key && styles.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!!loadError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{loadError}</Text>
                  <TouchableOpacity onPress={() => void load()}>
                    <Text style={styles.retryText}>Réessayer</Text>
                  </TouchableOpacity>
                </View>
              )}
              {loading && <ActivityIndicator style={styles.loader} />}
            </View>
          }
          ListEmptyComponent={
            !loading && !loadError
              ? <Text style={styles.muted}>Aucune demande dans cette liste.</Text>
              : null
          }
          renderItem={({ item }) => {
            const s = STATUS_LABEL[item.status];
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.badge, { backgroundColor: s.color }]}>{s.text}</Text>
                  <Text style={styles.muted}>{new Date(item.created_at).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Text style={styles.cardTitle}>{item.title || item.category || 'Demande de devis'}</Text>
                {!!item.category && (
                  <Text style={styles.muted}>
                    {item.category}
                    {item.urgency === 'urgent' ? ' · Urgent' : ''}
                  </Text>
                )}
                <Text style={styles.desc}>{item.description}</Text>
                {!!item.address && <Text style={styles.muted}>📍 {item.address}</Text>}
                {item.budget != null && <Text style={styles.muted}>Budget : {item.budget}</Text>}
                {item.artisan ? (
                  <View style={styles.artisanBox}>
                    <View style={styles.flex}>
                      <Text style={styles.artisanName}>{item.artisan.full_name ?? 'Artisan'}</Text>
                      <Text style={styles.muted}>
                        {[item.artisan.profession, item.artisan.phone].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => openChat(item.id)}>
                      <Ionicons name="chatbubble" size={16} color="#fff" />
                      <Text style={styles.chatBtnText}>Chat</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.muted}>Aucun artisan attribué pour le moment.</Text>
                )}
                {!!item.assigned_at && (
                  <Text style={styles.muted}>Attribuée le {new Date(item.assigned_at).toLocaleString('fr-FR')}</Text>
                )}
                {item.price != null && <Text style={styles.muted}>Prix estimatif : {item.price}</Text>}
                {!!item.artisan_comment && <Text style={styles.desc}>Commentaire de l’artisan : {item.artisan_comment}</Text>}
                {item.status === 'completed' && !!item.artisan_id && (
                  <TouchableOpacity style={styles.chatBtn} onPress={() => openRate(item)}>
                    <Ionicons name="star" size={16} color="#fff" />
                    <Text style={styles.chatBtnText}>{reviews[item.id] ? `Mon avis : ${reviews[item.id].rating}/5 · modifier` : 'Noter l’artisan'}</Text>
                  </TouchableOpacity>
                )}              </View>
            );
          }}
        />
      </KeyboardAvoidingView>
      <Modal visible={!!rateQuote} transparent animationType="slide" onRequestClose={() => setRateQuote(null)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 }}>
            <Text style={styles.cardTitle}>Noter {rateQuote?.artisan?.full_name ?? 'l’artisan'}</Text>
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setStars(n)} hitSlop={6}>
                  <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color="#F5A623" />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput {...INPUT_PROPS} style={[styles.field, styles.multiline]} placeholder="Votre avis (optionnel)" placeholderTextColor="#999" value={reviewText} onChangeText={setReviewText} multiline maxLength={1000} />
            <TouchableOpacity style={[styles.send, savingReview && styles.disabled]} onPress={submitReview} disabled={savingReview}>
              {savingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Publier mon avis</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRateQuote(null)} style={{ alignItems: 'center', padding: 6 }}>
              <Text style={styles.muted}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>    </SafeAreaView>
  );
}

const styles = themedStyles({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 12 },
  form: { gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#222' },
  listTitle: { fontSize: 18, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  muted: { fontSize: 14, color: '#666' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { color: '#444' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  field: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, color: '#222' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  send: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  newRequest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#007AFF', backgroundColor: '#fff' },
  newRequestText: { color: '#007AFF', fontWeight: '600' },
  support: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#007AFF', backgroundColor: '#fff' },
  supportText: { color: '#007AFF', fontWeight: '600' },
  errorBox: { borderRadius: 10, borderWidth: 1, borderColor: '#FF3B30', backgroundColor: '#FFF5F5', padding: 12, gap: 8 },
  errorText: { color: '#B42318' },
  retryText: { color: '#007AFF', fontWeight: '600' },
  loader: { marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { color: '#fff', fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  desc: { fontSize: 15, color: '#222' },
  artisanBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0F5FF', borderRadius: 10, padding: 10, marginTop: 4 },
  artisanName: { fontSize: 15, fontWeight: '600', color: '#222' },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#007AFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  chatBtnText: { color: '#fff', fontWeight: '600' },
});
