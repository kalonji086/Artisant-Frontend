import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

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

const RADIUS_METERS = 50_000;

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = useTheme();
  const t = useTranslate();
  const [artisans, setArtisans] = useState<NearbyArtisan[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasLocation = me !== null;
  const requestId = useRef(0);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (quiet = false) => {
    const request = ++requestId.current;
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const coords = await getCurrentCoords();
      if (request !== requestId.current) return;
      if (!coords) {
        setArtisans([]);
        setMe(null);
        setError('Autorisez la localisation pour afficher les artisans autour de vous.');
        return;
      }

      setMe(coords);
      void saveMyLocation(coords).catch((err: unknown) => {
        console.warn('[home] Enregistrement de la position impossible:', errorMessage(err, 'erreur inconnue'));
      });

      const { data, error: rpcError } = await supabase.rpc('nearby_artisans', {
        lat: coords.latitude,
        lng: coords.longitude,
        radius_meters: RADIUS_METERS,
        profession_filter: filter,
      });
      if (rpcError) throw rpcError;
      if (request !== requestId.current) return;

      const rows = (data as NearbyArtisan[] | null) ?? [];
      setArtisans(rows);
      setSelectedId((current) => (current && rows.some((artisan) => artisan.id === current) ? current : null));
    } catch (err) {
      if (request !== requestId.current) return;
      setError(`Impossible de charger les artisans : ${errorMessage(err, 'erreur inconnue')}`);
      setArtisans([]);
    } finally {
      if (request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    // load() updates state only after its asynchronous location and database requests.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasLocation) return;
    const channel = supabase
      .channel('nearby-artisans-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: 'role=eq.artisan',
      }, () => {
        if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
        realtimeTimer.current = setTimeout(() => {
          realtimeTimer.current = null;
          void load(true);
        }, 700);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[home] Synchronisation des artisans indisponible:', status);
        }
      });

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [load, hasLocation]);

  const selected = artisans.find((artisan) => artisan.id === selectedId) ?? null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <SafeAreaView style={styles.safe}>
      {me ? (
        <ArtisanMap center={me} artisans={artisans} onSelect={setSelectedId} fullScreen />
      ) : (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={40} color="#1877F2" />
          {loading ? (
            <ActivityIndicator size="large" color="#1877F2" />
          ) : (
            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>{error ?? t('La carte sera affichée après la localisation.')}</Text>
          )}
          {!loading && (
            <TouchableOpacity style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryText}>{t('Réessayer')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top}>
          <View style={styles.heading}>
            <Text style={styles.title}>{firstName ? `${t('Bonjour')} ${firstName}` : t('Artisans proches')}</Text>
            <Text style={styles.subtitle}>{t('Des professionnels autour de vous')}</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/profile')}
            accessibilityLabel="Ouvrir mon profil">
            <Ionicons name="person-outline" size={21} color="#17202e" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              setRefreshing(true);
              void load(true);
            }}
            accessibilityLabel="Actualiser la carte">
            {refreshing ? (
              <ActivityIndicator color="#1877F2" />
            ) : (
              <Ionicons name="refresh-outline" size={21} color="#17202e" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}>
          {[null, ...PROFESSIONS].map((profession) => (
            <TouchableOpacity
              key={profession ?? 'all'}
              style={[styles.filter, filter === profession && styles.filterActive]}
              onPress={() => setFilter(profession)}>
              <Text style={[styles.filterText, { color: filter === profession ? '#fff' : theme.text }, filter === profession && styles.filterTextActive]}>
                {profession ?? t('Tous les métiers')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {error && me && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.bottom}>
          {selected ? (
            <View style={[styles.selectedCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.selectedIdentity}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={22} color="#1877F2" />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]}>{selected.full_name ?? t('Artisan')}</Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    {[selected.profession, selected.city].filter(Boolean).join(' · ') || t('Professionnel')}
                  </Text>
                  {!!selected.description && (
                    <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>{selected.description}</Text>
                  )}
                </View>
                <View style={styles.distance}>
                  <Ionicons name="location-outline" size={15} color={theme.accent} />
                  <Text style={[styles.distanceText, { color: theme.accent }]}>{formatDistance(selected.distance_m)}</Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.quoteButton, { backgroundColor: theme.accent }]} onPress={() => router.push('/quotes')}>
                <Ionicons name="document-text-outline" size={17} color="#fff" />
                <Text style={styles.quoteText}>{t('Demander un devis')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.listHeader, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.flex}>
              <Text style={[styles.listTitle, { color: theme.text }]}>{t('Artisans disponibles')}</Text>
              <Text style={[styles.listSubtitle, { color: theme.textSecondary }]}>
                {loading ? t('Recherche en cours…') : `${artisans.length} ${t(artisans.length === 1 ? 'résultat' : 'résultats')}`}
                </Text>
              </View>
            {loading && <ActivityIndicator color={theme.accent} />}
              {!loading && artisans.length === 0 && !error && (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('Aucun artisan disponible à proximité.')}</Text>
              )}
              {artisans.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artisanList}>
                  {artisans.map((artisan) => (
                    <TouchableOpacity
                      key={artisan.id}
                      style={styles.artisanChip}
                      onPress={() => setSelectedId(artisan.id)}>
                      <Text style={styles.artisanName} numberOfLines={1}>
                        {artisan.full_name ?? t('Artisan')}
                      </Text>
                      <Text style={styles.artisanMeta} numberOfLines={1}>
                        {artisan.profession ?? t('Professionnel')} · {formatDistance(artisan.distance_m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e8eef5' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  heading: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, elevation: 5, shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  title: { color: '#101828', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#667085', fontSize: 12, marginTop: 2 },
  iconButton: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', elevation: 5 },
  filters: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 8 },
  filter: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, backgroundColor: '#fff', elevation: 3 },
  filterActive: { backgroundColor: '#1877F2' },
  filterText: { color: '#344054', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  bottom: { paddingHorizontal: 12, paddingBottom: 10 },
  listHeader: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 8, elevation: 7, shadowColor: '#101828', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  listTitle: { color: '#101828', fontSize: 15, fontWeight: '800' },
  listSubtitle: { color: '#667085', fontSize: 12, marginTop: 2 },
  emptyText: { color: '#667085', fontSize: 13, paddingVertical: 8 },
  artisanList: { gap: 8, paddingRight: 4 },
  artisanChip: { width: 190, borderRadius: 12, borderWidth: 1, borderColor: '#eaecf0', padding: 10 },
  artisanName: { color: '#101828', fontWeight: '700', fontSize: 13 },
  artisanMeta: { color: '#667085', fontSize: 11, marginTop: 3 },
  selectedCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 12, elevation: 7, shadowColor: '#101828', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  selectedIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eaf2ff' },
  flex: { flex: 1 },
  name: { color: '#101828', fontSize: 15, fontWeight: '800' },
  meta: { color: '#667085', fontSize: 12, marginTop: 2 },
  description: { color: '#475467', fontSize: 12, marginTop: 4 },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  distanceText: { color: '#1877F2', fontSize: 12, fontWeight: '700' },
  quoteButton: { height: 42, borderRadius: 10, backgroundColor: '#1877F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quoteText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  mapPlaceholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#eef3f8' },
  placeholderText: { color: '#475467', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  retryButton: { backgroundColor: '#1877F2', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  errorBanner: { marginHorizontal: 14, borderRadius: 10, padding: 10, backgroundColor: '#fff4ed' },
  errorText: { color: '#b54708', fontSize: 12 },
});
