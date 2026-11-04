import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = session?.user.id;

  const loadQuotes = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('quotes')
      .select('id, description, status, price, created_at, client_id')
      .eq('artisan_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.warn('[dashboard] devis:', error.message);
    const rows = (data ?? []) as (Omit<Quote, 'client'> & { client_id: string })[];

    // Requête séparée : ne dépend pas du nom de la clé étrangère.
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
    const { data: profs } = clientIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', clientIds)
      : { data: [] };
    const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
    setQuotes(rows.map((r) => ({ ...r, client: byId.get(r.client_id) ?? null })) as Quote[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
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
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" style={styles.center} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
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
          <View style={styles.center}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>
              {profile?.full_name ?? 'Artisan'}
              {profile?.profession ? ` · ${profile.profession}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.homeButton} onPress={() => router.push('/')}>
            <Ionicons name="home-outline" size={16} color="#007AFF" />
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

        <View style={styles.stats}>
          <Stat label="Nouvelles demandes" value={quotes.filter(isNew).length} color="#F5A623" />
          <Stat label="En cours" value={count('accepted')} color="#007AFF" />
          <Stat label="Terminées" value={count('completed')} color="#34C759" />
          <Stat label="Revenus" value={`${revenue.toLocaleString('fr-FR')}`} color="#5856D6" />
        </View>

        <Text style={styles.sectionTitle}>Demandes assignées par l&apos;Admin</Text>
        {pending.length === 0 && <Text style={styles.muted}>Aucune nouvelle demande.</Text>}
        {pending.map((q) => (
          <QuoteCard key={q.id} quote={q}>
            <ActionButton label="Accepter" color="#34C759" onPress={() => respond(q.id, 'accept')} />
            <ActionButton label="Refuser" color="#FF3B30" onPress={() => respond(q.id, 'reject')} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} />
          </QuoteCard>
        ))}

        <Text style={styles.sectionTitle}>Travaux en cours</Text>
        {accepted.length === 0 && <Text style={styles.muted}>Aucun travail en cours.</Text>}
        {accepted.map((q) => (
          <QuoteCard key={q.id} quote={q}>
            <ActionButton label="Marquer terminé" color="#007AFF" onPress={() => respond(q.id, 'complete')} />
            <ActionButton label="Chat" color="#5856D6" onPress={() => openChat(q.id)} />
          </QuoteCard>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mon profil</Text>
          <Text style={styles.muted}>Téléphone : {profile?.phone ?? 'Non renseigné'}</Text>
          <Text style={styles.muted}>Ville : {profile?.city ?? 'Non renseignée'}</Text>
          <Text style={styles.muted}>Note : {Number(profile?.rating ?? 0).toFixed(1)} / 5</Text>
          {!!profile?.description && <Text style={styles.muted}>{profile.description}</Text>}
        </View>

        <TouchableOpacity style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
      <Text style={styles.cardTitle}>{quote.client?.full_name ?? 'Client'}</Text>
      <Text style={styles.muted}>{quote.description ?? 'Sans description'}</Text>
      <Text style={styles.muted}>{new Date(quote.created_at).toLocaleDateString('fr-FR')}</Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function ActionButton(props: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.action, { backgroundColor: props.color }]} onPress={props.onPress}>
      <Text style={styles.actionText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1 },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
});
