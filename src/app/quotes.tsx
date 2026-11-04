import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { getCurrentCoords } from '@/lib/location';
import { PROFESSIONS } from '@/lib/professions';
import { errorMessage } from '@/lib/errors';

type Status = 'unassigned' | 'assigned' | 'pending' | 'accepted' | 'rejected' | 'completed';

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
  created_at: string;
  artisan_id: string | null;
  artisan: { full_name: string | null; phone: string | null; profession: string | null } | null;
};

const STATUS_LABEL: Record<Status, { text: string; color: string }> = {
  unassigned: { text: 'En attente d’un artisan', color: '#F5A623' },
  assigned: { text: 'Attribuée', color: '#5856D6' },
  pending: { text: 'Attribuée · en attente de réponse', color: '#5856D6' },
  accepted: { text: 'Acceptée', color: '#34C759' },
  rejected: { text: 'Refusée', color: '#FF3B30' },
  completed: { text: 'Terminée', color: '#007AFF' },
};

const URGENCIES = [
  { key: 'flexible', label: 'Flexible' },
  { key: 'normal', label: 'Normale' },
  { key: 'urgent', label: 'Urgente' },
] as const;

type Tab = 'all' | 'waiting' | 'assigned';

export default function MyQuotesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]['key']>('normal');
  const [address, setAddress] = useState('');
  const [budget, setBudget] = useState('');
  const [sending, setSending] = useState(false);
  const [quotes, setQuotes] = useState<MyQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('quotes')
      .select('id, title, category, description, urgency, address, budget, status, price, created_at, artisan_id')
      .eq('client_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.warn('[quotes]', error.message);
    const rows = (data ?? []) as Omit<MyQuote, 'artisan'>[];

    const artisanIds = Array.from(new Set(rows.map((r) => r.artisan_id).filter((id): id is string => !!id)));
    const { data: profs } = artisanIds.length
      ? await supabase.from('profiles').select('id, full_name, phone, profession').in('id', artisanIds)
      : { data: [] };
    const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
    setQuotes(rows.map((r) => ({ ...r, artisan: r.artisan_id ? (byId.get(r.artisan_id) ?? null) : null })) as MyQuote[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
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
        tab === 'all' ? true : tab === 'waiting' ? !q.artisan_id : !!q.artisan_id,
      ),
    [quotes, tab],
  );
  const waitingCount = quotes.filter((q) => !q.artisan_id).length;
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
      const { error } = await supabase.rpc('create_quote_request', {
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
      setCategory(null);
      setTitle('');
      setDescription('');
      setUrgency('normal');
      setAddress('');
      setBudget('');
      setTab('waiting');
      Alert.alert('Demande envoyée', 'Elle est en attente : l’équipe va l’attribuer à l’artisan le plus adapté.');
      load();
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
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
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
              <Text style={styles.title}>Demander un devis</Text>

              <Text style={styles.label}>Catégorie *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {PROFESSIONS.map((p) => (
                  <TouchableOpacity key={p} style={[styles.chip, category === p && styles.chipActive]} onPress={() => setCategory(p)}>
                    <Text style={[styles.chipText, category === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Titre</Text>
              <TextInput style={styles.field} placeholder="Ex : Fuite sous l’évier" placeholderTextColor="#999" value={title} onChangeText={setTitle} maxLength={120} />

              <Text style={styles.label}>Description *</Text>
              <TextInput
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
              <TextInput style={styles.field} placeholder="Quartier, rue, ville" placeholderTextColor="#999" value={address} onChangeText={setAddress} maxLength={250} />

              <Text style={styles.label}>Budget estimé (optionnel)</Text>
              <TextInput style={styles.field} placeholder="Montant" placeholderTextColor="#999" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" maxLength={12} />

              <TouchableOpacity style={[styles.send, sending && styles.disabled]} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Envoyer la demande</Text>}
              </TouchableOpacity>

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
              {loading && <ActivityIndicator style={styles.loader} />}
            </View>
          }
          ListEmptyComponent={!loading ? <Text style={styles.muted}>Aucune demande dans cette liste.</Text> : null}
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
                {item.price != null && <Text style={styles.muted}>Prix : {item.price}</Text>}
              </View>
            );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  support: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#007AFF', backgroundColor: '#fff' },
  supportText: { color: '#007AFF', fontWeight: '600' },
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
