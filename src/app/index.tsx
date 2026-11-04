import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { formatDistance, getCurrentCoords, saveMyLocation, type Coords } from '@/lib/location';
import { PROFESSIONS } from '@/lib/professions';
import { errorMessage } from '@/lib/errors';
import { ArtisanMap } from '@/components/artisan-map';

type NearbyArtisan = {
  id: string;
  full_name: string | null;
  profession: string | null;
  description: string | null;
  city: string | null;
  rating: number | null;
  distance_m: number;
  latitude: number;
  longitude: number;
};

const RADIUS_METERS = 50000;

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [artisans, setArtisans] = useState<NearbyArtisan[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const coords = await getCurrentCoords();
      if (!coords) {
        setArtisans([]);
        setMe(null);
        setError('Activez la localisation pour voir les artisans proches de vous.');
        return;
      }
      setMe(coords);
      void saveMyLocation(coords);
      const { data, error: rpcError } = await supabase.rpc('nearby_artisans', {
        lat: coords.latitude,
        lng: coords.longitude,
        radius_meters: RADIUS_METERS,
        profession_filter: filter,
      });
      if (rpcError) throw rpcError;
      setArtisans((data as NearbyArtisan[]) ?? []);
    } catch (err) {
      setArtisans([]);
      setError(`Impossible de charger les artisans : ${errorMessage(err, 'erreur inconnue')}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title}>{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</Text>
          <Text style={styles.subtitle}>Artisans les plus proches de vous</Text>
        </View>
        {profile?.role === 'artisan' && (
          <TouchableOpacity style={styles.dashButton} onPress={() => router.push('/dashboard')}>
            <Ionicons name="grid" size={16} color="#fff" />
            <Text style={styles.dashButtonText}>Mon dashboard</Text>
          </TouchableOpacity>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[null, ...PROFESSIONS].map((p) => (
            <TouchableOpacity
              key={p ?? 'all'}
              style={[styles.chip, filter === p && styles.chipActive]}
              onPress={() => setFilter(p)}>
              <Text style={[styles.chipText, filter === p && styles.chipTextActive]}>{p ?? 'Tous'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={styles.flex} />
      ) : (
        <FlatList
          data={artisans}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.mapWrap}>
              {me ? (
                <ArtisanMap center={me} artisans={artisans} onSelect={setSelectedId} />
              ) : (
                <TouchableOpacity style={styles.mapPlaceholder} onPress={load}>
                  <Ionicons name="location-outline" size={28} color="#007AFF" />
                  <Text style={styles.empty}>Activez le GPS pour voir la carte. Touchez pour réessayer.</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.requestBtn} onPress={() => router.push('/quotes')}>
                <Ionicons name="document-text" size={18} color="#fff" />
                <Text style={styles.dashButtonText}>Demander un devis</Text>
              </TouchableOpacity>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ?? `Aucun artisan disponible dans un rayon de ${RADIUS_METERS / 1000} km.`}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, selectedId === item.id && styles.cardSelected]}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color="#007AFF" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.name}>{item.full_name ?? 'Artisan'}</Text>
                <Text style={styles.meta}>
                  {[item.profession, item.city].filter(Boolean).join(' · ') || 'Artisan'}
                </Text>
                {!!item.description && (
                  <Text style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
              </View>
              <View style={styles.right}>
                <Text style={styles.distance}>{formatDistance(item.distance_m)}</Text>
                <Text style={styles.rating}>
                  <Ionicons name="star" size={12} color="#F5A623" /> {Number(item.rating ?? 0).toFixed(1)}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#222' },
  subtitle: { fontSize: 14, color: '#666' },
  dashButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#007AFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  dashButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  chips: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { color: '#444' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 20, gap: 12, flexGrow: 1 },
  mapWrap: { gap: 12 },
  mapPlaceholder: { height: 160, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 16 },
  requestBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 10 },
  cardSelected: { borderWidth: 2, borderColor: '#FF6B00' },
  empty: { textAlign: 'center', color: '#666', marginTop: 40 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: '#222' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  desc: { fontSize: 13, color: '#888', marginTop: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  distance: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  rating: { fontSize: 12, color: '#666' },
});
