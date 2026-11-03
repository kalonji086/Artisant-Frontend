import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { getCurrentCoords } from '@/lib/location';

type MyQuote = {
  id: string;
  description: string | null;
  status: 'unassigned' | 'assigned' | 'pending' | 'accepted' | 'rejected' | 'completed';
  price: number | null;
  created_at: string;
  artisan: { full_name: string | null; phone: string | null; profession: string | null } | null;
};

const STATUS_LABEL: Record<MyQuote['status'], { text: string; color: string }> = {
  unassigned: { text: 'En attente d’un artisan', color: '#F5A623' },
  assigned: { text: 'Artisan assigné', color: '#5856D6' },
  pending: { text: 'En attente', color: '#F5A623' },
  accepted: { text: 'Accepté', color: '#34C759' },
  rejected: { text: 'Refusé', color: '#FF3B30' },
  completed: { text: 'Terminé', color: '#007AFF' },
};

export default function MyQuotesScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [quotes, setQuotes] = useState<MyQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('quotes')
      .select('id, description, status, price, created_at, artisan_id')
      .eq('client_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.warn('[quotes]', error.message);
    const rows = (data ?? []) as (Omit<MyQuote, 'artisan'> & { artisan_id: string | null })[];

    // Requête séparée : ne dépend pas du nom de la clé étrangère.
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
    // Mise à jour en direct quand l'Admin assigne ou que l'artisan répond.
    const channel = supabase
      .channel(`my-quotes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `client_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const send = async () => {
    if (!description.trim()) {
      Alert.alert('Erreur', 'Décrivez votre besoin.');
      return;
    }
    setSending(true);
    try {
      const coords = await getCurrentCoords().catch(() => null);
      const { error } = await supabase.rpc('create_quote_request', {
        p_description: description.trim(),
        p_latitude: coords?.latitude ?? null,
        p_longitude: coords?.longitude ?? null,
      });
      if (error) throw error;
      setDescription('');
      Alert.alert('Demande envoyée', 'Un administrateur va vous assigner l’artisan le plus proche.');
      load();
    } catch (err) {
      Alert.alert('Envoi impossible', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={quotes}
          keyExtractor={(q) => q.id}
          contentContainerStyle={styles.content}
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
              <Text style={styles.muted}>
                Votre demande est traitée par l’équipe, qui l’assigne à l’artisan le plus proche de vous.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Décrivez ce dont vous avez besoin"
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity style={[styles.send, sending && styles.disabled]} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Envoyer la demande</Text>}
              </TouchableOpacity>
              <Text style={[styles.title, styles.listTitle]}>Mes demandes</Text>
              {loading && <ActivityIndicator style={styles.loader} />}
            </View>
          }
          ListEmptyComponent={!loading ? <Text style={styles.muted}>Aucune demande pour le moment.</Text> : null}
          renderItem={({ item }) => {
            const s = STATUS_LABEL[item.status];
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.badge, { backgroundColor: s.color }]}>{s.text}</Text>
                  <Text style={styles.muted}>{new Date(item.created_at).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Text style={styles.desc}>{item.description}</Text>
                {item.artisan && (
                  <Text style={styles.muted}>
                    Artisan : {item.artisan.full_name ?? '—'}
                    {item.artisan.profession ? ` · ${item.artisan.profession}` : ''}
                    {item.artisan.phone ? ` · ${item.artisan.phone}` : ''}
                  </Text>
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
  form: { gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#222' },
  listTitle: { fontSize: 18, marginTop: 12 },
  muted: { fontSize: 14, color: '#666' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, minHeight: 90, textAlignVertical: 'top', color: '#222' },
  send: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  loader: { marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { color: '#fff', fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  desc: { fontSize: 15, color: '#222' },
});
