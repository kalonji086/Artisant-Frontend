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
import { useTheme } from '@/hooks/use-theme';
import { useTranslate, useUserPreferences } from '@/lib/user-preferences-context';

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
  const theme = useTheme();
  const t = useTranslate();
  const { preferences } = useUserPreferences();
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
    // Load server state on mount; updates happen after the request completes.
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
        tab === 'all' ? true : tab === 'waiting' ? !q.artisan_id : !!q.artisan_id,
      ),
    [quotes, tab],
  );
  const waitingCount = quotes.filter((q) => !q.artisan_id).length;
  const assignedCount = quotes.length - waitingCount;

  const send = async () => {
    if (!category) return Alert.alert(t('Catégorie requise'), t('Choisissez le type de service.'));
    if (description.trim().length < 10) return Alert.alert(t('Description trop courte'), t('Décrivez votre besoin (10 caractères minimum).'));
    const budgetValue = budget.trim() ? Number(budget.replace(',', '.')) : null;
    if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)) {
      return Alert.alert(t('Budget invalide'), t('Entrez un montant valide ou laissez vide.'));
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
      Alert.alert(t('Demande envoyée'), t('Elle est en attente : l’équipe va l’attribuer à l’artisan le plus adapté.'));
      load();
    } catch (err) {
      Alert.alert('Envoi impossible', errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const openChat = async (quoteId: string) => {
    const { data, error } = await supabase.rpc('start_quote_chat', { p_quote_id: quoteId });
    if (error || !data) return Alert.alert(t('Chat indisponible'), errorMessage(error, t('Réessayez plus tard.')));
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const openSupport = async () => {
    const { data, error } = await supabase.rpc('start_support_chat');
    if (error || !data) return Alert.alert(t('Chat indisponible'), errorMessage(error, t('Réessayez plus tard.')));
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: `${t('Toutes')} (${quotes.length})` },
    { key: 'waiting', label: `${t('En attente')} (${waitingCount})` },
    { key: 'assigned', label: `${t('Attribuées')} (${assignedCount})` },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
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
              <Text style={[styles.title, { color: theme.text }]}>{t('Demander un devis')}</Text>

              <Text style={[styles.label, { color: theme.text }]}>{t('Catégorie *')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {PROFESSIONS.map((p) => (
                  <TouchableOpacity key={p} style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }, category === p && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setCategory(p)}>
                    <Text style={[styles.chipText, { color: theme.text }, category === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.label, { color: theme.text }]}>{t('Titre')}</Text>
              <TextInput style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]} placeholder={t('Ex : Fuite sous l’évier')} placeholderTextColor={theme.textSecondary} value={title} onChangeText={setTitle} maxLength={120} />

              <Text style={[styles.label, { color: theme.text }]}>{t('Description *')}</Text>
              <TextInput
                style={[styles.field, styles.multiline, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
                placeholder={t('Décrivez précisément votre besoin')}
                placeholderTextColor={theme.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={1000}
              />

              <Text style={[styles.label, { color: theme.text }]}>{t('Urgence')}</Text>
              <View style={styles.chips}>
                {URGENCIES.map((u) => (
                  <TouchableOpacity key={u.key} style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }, urgency === u.key && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setUrgency(u.key)}>
                    <Text style={[styles.chipText, { color: theme.text }, urgency === u.key && styles.chipTextActive]}>{t(u.label)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: theme.text }]}>{t('Adresse d’intervention')}</Text>
              <TextInput style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]} placeholder={t('Quartier, rue, ville')} placeholderTextColor={theme.textSecondary} value={address} onChangeText={setAddress} maxLength={250} />

              <Text style={[styles.label, { color: theme.text }]}>{t('Budget estimé (optionnel)')}</Text>
              <TextInput style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]} placeholder={t('Montant')} placeholderTextColor={theme.textSecondary} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" maxLength={12} />

              <TouchableOpacity style={[styles.send, { backgroundColor: theme.accent }, sending && styles.disabled]} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>{t('Envoyer la demande')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.support, { borderColor: theme.accent, backgroundColor: theme.background }]} onPress={openSupport}>
                <Ionicons name="chatbubbles-outline" size={18} color={theme.accent} />
                <Text style={[styles.supportText, { color: theme.accent }]}>{t('Discuter avec Artisant (support)')}</Text>
              </TouchableOpacity>

              <Text style={[styles.title, styles.listTitle, { color: theme.text }]}>{t('Mes demandes')}</Text>
              <View style={styles.chips}>
                {tabs.map((tabOption) => (
                  <TouchableOpacity key={tabOption.key} style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }, tab === tabOption.key && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setTab(tabOption.key)}>
                    <Text style={[styles.chipText, { color: theme.text }, tab === tabOption.key && styles.chipTextActive]}>{tabOption.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {loading && <ActivityIndicator style={styles.loader} />}
            </View>
          }
          ListEmptyComponent={!loading ? <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Aucune demande dans cette liste.')}</Text> : null}
          renderItem={({ item }) => {
            const s = STATUS_LABEL[item.status];
            return (
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.row}>
                  <Text style={[styles.badge, { backgroundColor: s.color }]}>{t(s.text)}</Text>
                  <Text style={[styles.muted, { color: theme.textSecondary }]}>{new Date(item.created_at).toLocaleDateString(preferences.language === 'en' ? 'en-US' : 'fr-FR')}</Text>
                </View>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{item.title || item.category || t('Demande de devis')}</Text>
                {!!item.category && (
                  <Text style={[styles.muted, { color: theme.textSecondary }]}>
                    {item.category}
                    {item.urgency === 'urgent' ? ` · ${t('Urgent')}` : ''}
                  </Text>
                )}
                <Text style={[styles.desc, { color: theme.text }]}>{item.description}</Text>
                {!!item.address && <Text style={[styles.muted, { color: theme.textSecondary }]}>📍 {item.address}</Text>}
                {item.budget != null && <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Budget')} : {item.budget}</Text>}
                {item.artisan ? (
                  <View style={[styles.artisanBox, { backgroundColor: theme.background }]}>
                    <View style={styles.flex}>
                      <Text style={[styles.artisanName, { color: theme.text }]}>{item.artisan.full_name ?? t('Artisan')}</Text>
                      <Text style={[styles.muted, { color: theme.textSecondary }]}>
                        {[item.artisan.profession, item.artisan.phone].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <TouchableOpacity style={[styles.chatBtn, { backgroundColor: theme.accent }]} onPress={() => openChat(item.id)}>
                      <Ionicons name="chatbubble" size={16} color="#fff" />
                      <Text style={styles.chatBtnText}>{t('Chat')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Aucun artisan attribué pour le moment.')}</Text>
                )}
                {item.price != null && <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Prix')} : {item.price}</Text>}
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
