import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import {
  formatDistance,
  getCurrentCoords,
  getRouteDistance,
  saveMyLocation,
  type Coords,
  type TravelMode,
} from '@/lib/location';
import { getRelatedProfessions, PROFESSIONS } from '@/lib/professions';
import { errorMessage } from '@/lib/errors';
import { ArtisanMap } from '@/components/artisan-map';
import { NotificationBell } from '@/components/notification-bell';

type NearbyArtisan = {
  id: string;
  full_name: string | null;
  profession: string | null;
  description: string | null;
  city: string | null;
  rating: number | null;
  avatar_url: string | null;
  distance_m: number;
  latitude: number;
  longitude: number;
  phone: string | null;
  is_online: boolean | null;
};

const RADIUS_METERS = 50000;

export default function HomeScreen() {
  useSettings();
  const router = useRouter();
  const { profile, session } = useAuth();
  const [artisans, setArtisans] = useState<NearbyArtisan[]>([]);
  const [suggestedArtisans, setSuggestedArtisans] = useState<NearbyArtisan[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portfolioData, setPortfolioData] = useState<{ artisanId: string; items: string[] } | null>(null);
  const [reviewsData, setReviewsData] = useState<{
    artisanId: string;
    items: { id: string; client_name: string | null; rating: number; comment: string | null }[];
  } | null>(null);
  const meRef = useRef<Coords | null>(null);
  const selected = artisans.find((a) => a.id === selectedId) ?? null;
  const selectedSuggested = suggestedArtisans.find((a) => a.id === selectedId) ?? null;
  const selectedOwnProfile = useMemo<NearbyArtisan | null>(
    () => selectedId === session?.user.id && profile?.role === 'artisan' && me
      ? {
          id: profile.id,
          full_name: profile.full_name,
          profession: profile.profession,
          description: profile.description,
          city: profile.city,
          rating: profile.rating,
          avatar_url: profile.avatar_url,
          distance_m: 0,
          latitude: me.latitude,
          longitude: me.longitude,
          phone: profile.phone,
          is_online: true,
        }
      : null,
    [selectedId, session?.user.id, profile, me],
  );
  const selectedProfile = selectedOwnProfile ?? selected ?? selectedSuggested;
  const travelModes: { id: TravelMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'foot', label: 'À pied', icon: 'walk-outline' },
    { id: 'bike', label: 'Vélo', icon: 'bicycle-outline' },
    { id: 'car', label: 'Voiture', icon: 'car-outline' },
  ];

  useEffect(() => {
    if (!selectedProfile || !me) return;
    if (selectedProfile.id === session?.user.id) return;

    let active = true;
    const controller = new AbortController();
    // Loading state mirrors the active route request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRouteLoading(true);
    setRouteDistance(null);
    setRouteUnavailable(false);
    void getRouteDistance(
      me,
      { latitude: selectedProfile.latitude, longitude: selectedProfile.longitude },
      travelMode,
      controller.signal,
    )
      .then((distance) => {
        if (active) setRouteDistance(distance);
      })
      .catch((err: unknown) => {
        if (active) {
          console.warn('[home] calcul de l’itinéraire impossible:', err instanceof Error ? err.message : err);
          setRouteDistance(null);
          setRouteUnavailable(true);
        }
      })
      .finally(() => {
        if (active) setRouteLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedProfile, me, session?.user.id, travelMode]);
  const portfolio = portfolioData?.artisanId === selectedId ? portfolioData.items : [];
  const reviews = reviewsData?.artisanId === selectedId ? reviewsData.items : [];

  const fetchArtisans = useCallback(
    async (coords: Coords) => {
      const { data, error: rpcError } = await supabase.rpc('nearby_artisans', {
        lat: coords.latitude,
        lng: coords.longitude,
        radius_meters: RADIUS_METERS,
        profession_filter: filter,
      });
      if (rpcError) throw rpcError;
      const nearby = ((data as NearbyArtisan[]) ?? []).filter((artisan) => artisan.id !== session?.user.id);
      setArtisans(nearby);
      if (filter && nearby.length === 0) {
        const { data: suggestions, error: suggestionError } = await supabase.rpc('nearby_artisans', {
          lat: coords.latitude,
          lng: coords.longitude,
          radius_meters: RADIUS_METERS,
          profession_filter: null,
        });
        if (suggestionError) throw suggestionError;
        const relatedProfessions = getRelatedProfessions(filter);
        const alternatives = ((suggestions as NearbyArtisan[]) ?? [])
          .filter((artisan) => artisan.id !== session?.user.id)
          .sort((left, right) => {
            const leftRank = relatedProfessions.indexOf(left.profession ?? '');
            const rightRank = relatedProfessions.indexOf(right.profession ?? '');
            const leftRelated = leftRank < 0 ? 1 : 0;
            const rightRelated = rightRank < 0 ? 1 : 0;
            return leftRelated - rightRelated || leftRank - rightRank || left.distance_m - right.distance_m;
          });
        setSuggestedArtisans(alternatives.slice(0, 8));
      } else {
        setSuggestedArtisans([]);
      }
    },
    [filter, session?.user.id],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const coords = await getCurrentCoords();
      if (!coords) {
        setArtisans([]);
        setMe(null);
        setError('Activez la localisation pour voir les artisans proches de vous.');
        return;
      }
      meRef.current = coords;
      setMe(coords);
      await saveMyLocation(coords);
      await fetchArtisans(coords);
    } catch (err) {
      setError(`Impossible de charger les artisans : ${errorMessage(err, 'erreur inconnue')}`);
    } finally {
      setLoading(false);
    }
  }, [fetchArtisans]);

  useEffect(() => {
    // load fetches location and updates React state after its asynchronous work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Temps réel : les artisans apparaissent / disparaissent selon leur position et leur disponibilité.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (meRef.current) void fetchArtisans(meRef.current).catch(() => undefined);
      }, 800);
    };
    const channel = supabase
      .channel('home-artisans')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, refresh)
      .subscribe();
    // L'état « en ligne » expire sans événement : rafraîchissement léger.
    const interval = setInterval(refresh, 60000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [fetchArtisans]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    supabase
      .from('portfolio_items')
      .select('image_url')
      .eq('artisan_id', selectedId)
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!cancelled) {
          setPortfolioData({ artisanId: selectedId, items: (data ?? []).map((r) => r.image_url as string) });
        }
      });
    supabase
      .from('reviews')
      .select('id, client_name, rating, comment')
      .eq('artisan_id', selectedId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) {
          setReviewsData({
            artisanId: selectedId,
            items: (data ?? []) as { id: string; client_name: string | null; rating: number; comment: string | null }[],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const requireLogin = () => {
    if (session?.user.id) return false;
    router.push('/(auth)/login');
    return true;
  };

  const contact = async (a: NearbyArtisan) => {
    if (requireLogin()) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('start_direct_chat', { p_artisan_id: a.id });
    setBusy(false);
    if (err || !data) return Alert.alert('Chat indisponible', errorMessage(err, 'Réessayez plus tard.'));
    router.push({ pathname: '/messages', params: { c: (data as { id: string }).id } });
  };

  const requestQuote = (a: NearbyArtisan) => {
    if (requireLogin()) return;
    router.push({
      pathname: '/quotes',
      params: { category: a.profession ?? '', title: `Demande pour ${a.full_name ?? 'l’artisan'}`, artisanId: a.id },
    });
  };

  return (
    <View style={styles.root}>
      {loading ? (
        <ActivityIndicator size="large" style={styles.flex} />
      ) : me ? (
        <ArtisanMap
          fullScreen
          center={me}
          artisans={artisans.length > 0 ? artisans : suggestedArtisans}
          userName={profile?.full_name}
          userId={profile?.id}
          userRole={profile?.role === 'artisan' ? 'Artisan' : 'Client'}
          userAvatar={profile?.avatar_url}
          userProfession={profile?.profession}
          onSelect={setSelectedId}
        />
      ) : (
        <TouchableOpacity style={styles.placeholder} onPress={load}>
          <Ionicons name="location-outline" size={32} color="#007AFF" />
          <Text style={styles.empty}>{error ?? 'Activez le GPS pour voir la carte.'} Touchez pour réessayer.</Text>
        </TouchableOpacity>
      )}

      <SafeAreaView style={styles.top} edges={['top']} pointerEvents="box-none">
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title}>
              {profile?.full_name ? `Bonjour ${profile.full_name.split(' ')[0]}` : 'Bonjour'}
            </Text>
            <Text style={styles.subtitle}>
              {artisans.length} artisan{artisans.length > 1 ? 's' : ''} près de vous
            </Text>
          </View>
          {profile?.role === 'artisan' && (
            <TouchableOpacity style={styles.dashButton} onPress={() => router.push('/dashboard')}>
              <Ionicons name="grid" size={16} color="#fff" />
              <Text style={styles.dashButtonText}>Dashboard</Text>
            </TouchableOpacity>
          )}
          {session && <NotificationBell />}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[null, ...PROFESSIONS].map((p) => (
            <TouchableOpacity key={p ?? 'all'} style={[styles.chip, filter === p && styles.chipActive]} onPress={() => setFilter(p)}>
              <Text style={[styles.chipText, filter === p && styles.chipTextActive]}>{p ?? 'Tous'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {!!filter && artisans.length === 0 && !loading && (
          <View style={styles.suggestionsCard}>
            <Text style={styles.suggestionsTitle}>Aucun artisan « {filter} » près de vous</Text>
            <Text style={styles.suggestionsText}>
              Essayez une autre catégorie. Voici des artisans proches qui peuvent peut-être vous aider :
            </Text>
            {suggestedArtisans.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionList}>
                {suggestedArtisans.map((artisan) => (
                  <TouchableOpacity
                    key={artisan.id}
                    style={styles.suggestionItem}
                    onPress={() => setSelectedId(artisan.id)}>
                    <Text style={styles.suggestionName} numberOfLines={1}>{artisan.full_name ?? 'Artisan'}</Text>
                    <Text style={styles.suggestionMeta} numberOfLines={1}>
                      {artisan.profession ?? 'Autre'} · {formatDistance(artisan.distance_m)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.suggestionsText}>Aucun autre artisan disponible dans votre zone pour le moment.</Text>
            )}
          </View>
        )}
      </SafeAreaView>

      {selectedProfile && (
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.close} onPress={() => setSelectedId(null)} hitSlop={10}>
            <Ionicons name="close" size={22} color="#666" />
          </TouchableOpacity>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHeader}>
              <View style={styles.avatar}>
                {selectedProfile.avatar_url ? (
                  <Image source={{ uri: selectedProfile.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={28} color="#007AFF" />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.name}>{selectedProfile.full_name ?? 'Artisan'}</Text>
                <Text style={styles.meta}>{selectedProfile.profession ?? 'Artisan'}</Text>
                <Text style={{ color: selectedProfile.is_online ? '#34C759' : '#999', fontSize: 12, fontWeight: '600' }}>
                  {selectedProfile.is_online ? '● En ligne' : '○ Hors ligne'}
                </Text>
              </View>
              <Text style={styles.distance}>{formatDistance(selectedProfile.distance_m)}</Text>
            </View>

            <View style={styles.badges}>
              <Text style={styles.badge}>⭐ {Number(selectedProfile.rating ?? 0).toFixed(1)}</Text>
              <Text style={styles.badge}>{selectedProfile.city ?? 'Ville non renseignée'}</Text>
              {!!selectedProfile.phone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${selectedProfile.phone}`)}>
                  <Text style={[styles.badge, styles.phone]}>📞 {selectedProfile.phone}</Text>
                </TouchableOpacity>
              )}
            </View>

            {selectedProfile && <View style={styles.routeCard}>
              <Text style={styles.routeTitle}>Distance depuis vous</Text>
              <View style={styles.travelModes}>
                {selectedProfile.id !== session?.user.id && travelModes.map((mode) => (
                  <TouchableOpacity
                    key={mode.id}
                    style={[styles.travelMode, travelMode === mode.id && styles.travelModeActive]}
                    onPress={() => setTravelMode(mode.id)}>
                    <Ionicons name={mode.icon} size={16} color={travelMode === mode.id ? '#fff' : '#007AFF'} />
                    <Text style={[styles.travelModeText, travelMode === mode.id && styles.travelModeTextActive]}>
                      {mode.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.routeDistance}>
                {selectedProfile.id === session?.user.id
                  ? 'Vous êtes ici, à votre position GPS.'
                  : routeLoading
                  ? 'Calcul de l’itinéraire…'
                  : routeDistance !== null
                    ? `${formatDistance(routeDistance)} · distance estimée par itinéraire`
                    : routeUnavailable
                      ? `${formatDistance(selectedProfile.distance_m)} à vol d’oiseau · itinéraire indisponible`
                      : `${formatDistance(selectedProfile.distance_m)} à vol d’oiseau`}
              </Text>
            </View>}

            {!!selectedProfile.description && <Text style={styles.desc}>{selectedProfile.description}</Text>}

            {(selected || selectedOwnProfile) && portfolio.length > 0 && (
              <>
                <Text style={styles.section}>Réalisations</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
                  {portfolio.map((uri) => (
                    <Image key={uri} source={{ uri }} style={styles.work} />
                  ))}
                </ScrollView>
              </>
            )}

            {(selected || selectedOwnProfile) && reviews.length > 0 && (
              <>
                <Text style={styles.section}>Avis ({reviews.length})</Text>
                {reviews.map((r) => (
                  <View key={r.id} style={styles.review}>
                    <Text style={styles.reviewHead}>{r.client_name ?? 'Client'} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                    {!!r.comment && <Text style={styles.desc}>{r.comment}</Text>}
                  </View>
                ))}
              </>
            )}
            {profile?.role === 'client' ||
            (profile?.role === 'artisan' && selectedProfile.id !== session?.user.id) ? (
              <>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => contact(selectedProfile)} disabled={busy}>
                    <Ionicons name="chatbubble" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Contacter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => requestQuote(selectedProfile)} disabled={busy}>
                    <Ionicons name="document-text-outline" size={16} color="#007AFF" />
                    <Text style={styles.btnSecondaryText}>Demander un devis</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.exploit}
                  onPress={() => router.push({ pathname: '/portfolio', params: { artisanId: selectedProfile.id } })}
                  disabled={busy}>
                  <Ionicons name="images-outline" size={17} color="#FF6B00" />
                  <Text style={styles.exploitText}>Voir les réalisations</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.ownProfileNote}>
                {selectedProfile.id === session?.user.id
                  ? 'C’est votre profil : ces actions ne sont pas disponibles sur votre propre compte.'
                  : 'Connectez-vous comme client ou artisan pour contacter un artisan.'}
              </Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: '#e8e8e8' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  empty: { color: '#444', textAlign: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 6, padding: 10, borderRadius: 14, backgroundColor: '#ffffffee' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  subtitle: { fontSize: 12, color: '#666' },
  dashButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#007AFF', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  dashButtonText: { color: '#fff', fontWeight: '600' },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  suggestionsCard: { marginHorizontal: 12, marginTop: 2, padding: 12, borderRadius: 14, gap: 7, backgroundColor: '#ffffffee' },
  suggestionsTitle: { color: '#222', fontWeight: '700', fontSize: 13 },
  suggestionsText: { color: '#555', fontSize: 12, lineHeight: 17 },
  suggestionList: { gap: 8, paddingVertical: 2 },
  suggestionItem: { maxWidth: 190, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f2f7ff', borderWidth: 1, borderColor: '#d8e7ff' },
  suggestionName: { color: '#222', fontWeight: '700', fontSize: 12 },
  suggestionMeta: { color: '#555', fontSize: 11, marginTop: 3 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: '#ffffffee', borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { color: '#333', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 12 },
  close: { position: 'absolute', top: 10, right: 12, zIndex: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 28 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 64, height: 64 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  meta: { fontSize: 14, color: '#666' },
  distance: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  badge: { backgroundColor: '#f2f2f2', color: '#333', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', fontSize: 13 },
  phone: { color: '#007AFF' },
  routeCard: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#f2f7ff', gap: 8 },
  routeTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  travelModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  travelMode: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#cbdcf5', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  travelModeActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  travelModeText: { color: '#007AFF', fontSize: 12, fontWeight: '600' },
  travelModeTextActive: { color: '#fff' },
  routeDistance: { color: '#555', fontSize: 12 },
  desc: { color: '#444', marginTop: 10, lineHeight: 20 },
  section: { fontWeight: '700', color: '#222', marginTop: 12, marginBottom: 6 },
  review: { backgroundColor: '#f7f7f7', borderRadius: 10, padding: 10, marginBottom: 6 },
  reviewHead: { fontWeight: '600', color: '#222' },
  gallery: { gap: 8 },
  work: { width: 110, height: 80, borderRadius: 10, backgroundColor: '#eee' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  btnPrimary: { backgroundColor: '#007AFF' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnSecondary: { borderWidth: 1, borderColor: '#007AFF' },
  btnSecondaryText: { color: '#007AFF', fontWeight: '700' },
  exploit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  exploitText: { color: '#FF6B00', fontWeight: '600' },
  ownProfileNote: { color: '#666', textAlign: 'center', fontSize: 13, paddingVertical: 12 },
});
