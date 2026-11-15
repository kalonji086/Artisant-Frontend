import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
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
import { formatDistance, getCurrentCoords, saveMyLocation, type Coords } from '@/lib/location';
import { PROFESSIONS } from '@/lib/professions';
import { errorMessage } from '@/lib/errors';
import { ArtisanMap } from '@/components/artisan-map';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';
import { useUnreadNotificationCount } from '@/hooks/use-unread-notification-count';

type NearbyArtisan = {
  id: string;
  full_name: string | null;
  profession: string | null;
  description: string | null;
  city: string | null;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  years_experience: number | null;
  service_radius_km: number | null;
  rating: number | null;
  distance_m: number;
  latitude: number;
  longitude: number;
};

const RADIUS_METERS = 50_000;

export default function HomeScreen() {
  const router = useRouter();
  const { profile, session, loading: authLoading, profileLoading } = useAuth();
  const theme = useTheme();
  const t = useTranslate();
  const unreadCount = useUnreadNotificationCount();
  const userId = session?.user.id;
  const [artisans, setArtisans] = useState<NearbyArtisan[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasLocation = me !== null;
  const requestId = useRef(0);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocationRefreshAt = useRef(0);

  const load = useCallback(async (quiet = false, coordsOverride?: Coords, persistLocation = true) => {
    const request = ++requestId.current;
    if (authLoading || profileLoading) return;
    if (!session?.user.id || profile?.role !== 'client') {
      setArtisans([]);
      setSelectedId(null);
      setMe(null);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const coords = coordsOverride ?? await getCurrentCoords();
      if (request !== requestId.current) return;
      if (!coords) {
        setArtisans([]);
        setMe(null);
        setError('Autorisez la localisation pour afficher les artisans autour de vous.');
        return;
      }

      setMe(coords);
      if (persistLocation) {
        void saveMyLocation(coords).catch((err: unknown) => {
          console.warn('[home] Enregistrement de la position impossible:', errorMessage(err, 'erreur inconnue'));
        });
      }

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
  }, [authLoading, profileLoading, session?.user.id, profile?.role, filter]);

  useEffect(() => {
    // load() updates state only after its asynchronous location and database requests.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    realtimeTimer.current = setTimeout(() => {
      realtimeTimer.current = null;
      void load(true, undefined, false);
    }, 700);
  }, [load]);

  const scheduleLocationRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastLocationRefreshAt.current < 5_000) return;
    lastLocationRefreshAt.current = now;
    scheduleRealtimeRefresh();
  }, [scheduleRealtimeRefresh]);

  useEffect(() => {
    if (!hasLocation || !userId) return;
    const profileChannel = supabase
      .channel('nearby-artisans-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: 'role=eq.artisan',
      }, scheduleRealtimeRefresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[home] Synchronisation des artisans indisponible:', status);
        }
      });

    const artisanLocationChannel = supabase
      .channel('nearby_artisan_locations', { config: { private: true } })
      .on('broadcast', { event: 'artisan_location_changed' }, scheduleLocationRefresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[home] Synchronisation des positions des artisans indisponible:', status);
        }
      });

    const artisanProfileChannel = supabase
      .channel('nearby_artisan_profiles', { config: { private: true } })
      .on('broadcast', { event: 'artisan_profile_changed' }, scheduleRealtimeRefresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[home] Synchronisation des détails des artisans indisponible:', status);
        }
      });

    const ownLocationChannel = supabase
      .channel(`user_location:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'user_location_changed' }, scheduleRealtimeRefresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[home] Synchronisation de votre position indisponible:', status);
        }
      });

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
      void supabase.removeChannel(profileChannel);
      void supabase.removeChannel(artisanLocationChannel);
      void supabase.removeChannel(artisanProfileChannel);
      void supabase.removeChannel(ownLocationChannel);
    };
  }, [scheduleLocationRefresh, scheduleRealtimeRefresh, hasLocation, userId]);

  const normalizedQuery = searchQuery
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const visibleArtisans = normalizedQuery
    ? artisans.filter((artisan) => {
        const searchText = [artisan.full_name, artisan.profession, artisan.city, artisan.description]
          .filter(Boolean)
          .join(' ')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
    : artisans;
  const selected = visibleArtisans.find((artisan) => artisan.id === selectedId) ?? null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <View style={[styles.heading, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.title, { color: theme.text }]}>{firstName ? `${t('Bonjour')} ${firstName}` : t('Artisans proches')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('Des professionnels autour de vous')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.push('/notifications')}
          accessibilityLabel={t('Notifications')}>
          <Ionicons name="notifications-outline" size={21} color={theme.text} />
          {unreadCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => {
            setRefreshing(true);
            void load(true);
          }}
          accessibilityLabel="Actualiser la carte">
          {refreshing ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={21} color={theme.text} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchField, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search-outline" size={19} color={theme.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('Rechercher un artisan')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            accessibilityLabel={t('Rechercher un artisan')}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel={t('Effacer la recherche')}>
              <Ionicons name="close-circle" size={19} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.categoryButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => setCategoryPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('Choisir une catégorie')}>
          <Ionicons name="options-outline" size={18} color={theme.accent} />
          <Text style={[styles.categoryButtonText, { color: theme.text }]} numberOfLines={1}>
            {filter ?? t('Catégories')}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.categorySheet, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.sheetHeading}>
              <View style={styles.flex}>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('Choisir une catégorie')}</Text>
                <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>{t('Toutes les catégories')}</Text>
              </View>
              <TouchableOpacity onPress={() => setCategoryPickerVisible(false)} accessibilityLabel={t('Fermer')}>
                <Ionicons name="close" size={23} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.categoryOptions} showsVerticalScrollIndicator={false}>
              {[null, ...PROFESSIONS].map((profession) => {
                const isActive = filter === profession;
                return (
                  <TouchableOpacity
                    key={profession ?? 'all'}
                    style={[
                      styles.categoryOption,
                      { borderColor: theme.backgroundSelected },
                      isActive && { borderColor: theme.accent, backgroundColor: `${theme.accent}15` },
                    ]}
                    onPress={() => {
                      setFilter(profession);
                      setCategoryPickerVisible(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}>
                    <Ionicons
                      name={profession ? 'briefcase-outline' : 'apps-outline'}
                      size={19}
                      color={isActive ? theme.accent : theme.textSecondary}
                    />
                    <Text style={[styles.categoryOptionText, { color: isActive ? theme.accent : theme.text }]}>
                      {profession ?? t('Toutes les catégories')}
                    </Text>
                    {isActive ? <Ionicons name="checkmark-circle" size={19} color={theme.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedId(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedId(null)}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer la fiche artisan')}
          />
          {selected ? (
            <View style={[styles.profileSheet, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.profileHandle} />
              <View style={styles.profileHeader}>
                <ArtisanAvatar
                  key={`${selected.id}-${selected.avatar_url ?? ''}`}
                  uri={selected.avatar_url}
                  accent={theme.accent}
                />
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]}>{selected.full_name ?? t('Artisan')}</Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    {[selected.profession, selected.city].filter(Boolean).join(' · ') || t('Professionnel')}
                  </Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#f59e0b" />
                    <Text style={[styles.ratingText, { color: theme.textSecondary }]}>
                      {selected.rating && selected.rating > 0 ? `${Number(selected.rating).toFixed(1)} / 5` : t('Nouvel artisan')}
                    </Text>
                    <Text style={[styles.distanceText, { color: theme.accent }]}>
                      {formatDistance(selected.distance_m)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedId(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('Fermer')}>
                  <Ionicons name="close" size={23} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.profileScroll}
                contentContainerStyle={styles.profileContent}
                showsVerticalScrollIndicator={false}>
                <ProfileInfoRow icon="call-outline" label={t('Téléphone')} value={selected.phone} theme={theme} />
                <ProfileInfoRow icon="location-outline" label={t('Adresse exacte')} value={selected.address} theme={theme} />
                <ProfileInfoRow icon="earth-outline" label={t('Pays')} value={selected.country} theme={theme} />
                <ProfileInfoRow
                  icon="briefcase-outline"
                  label={t("Années d'expérience")}
                  value={selected.years_experience == null ? null : `${selected.years_experience} an(s)`}
                  theme={theme}
                />
                <ProfileInfoRow
                  icon="navigate-outline"
                  label={t("Rayon d'intervention")}
                  value={selected.service_radius_km == null ? null : `${selected.service_radius_km} km`}
                  theme={theme}
                />
                <ProfileInfoRow icon="document-text-outline" label={t('Description')} value={selected.description} theme={theme} />
              </ScrollView>
              <TouchableOpacity
                style={[styles.quoteButton, { backgroundColor: theme.accent }]}
                onPress={() => {
                  setSelectedId(null);
                  router.push('/quotes');
                }}>
                <Ionicons name="document-text-outline" size={17} color="#fff" />
                <Text style={styles.quoteText}>{t('Demander un devis')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>

      {error && me && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.mapArea}>
        {me ? (
          <ArtisanMap center={me} artisans={visibleArtisans} onSelect={setSelectedId} fullScreen />
        ) : (
          <View style={[styles.mapPlaceholder, { backgroundColor: theme.background }]}>
            <Ionicons name="map-outline" size={40} color={theme.accent} />
            {loading ? (
              <ActivityIndicator size="large" color={theme.accent} />
            ) : (
              <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>{error ?? t('La carte sera affichée après la localisation.')}</Text>
            )}
            {!loading && (
              <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.accent }]} onPress={() => void load()}>
                <Text style={styles.retryText}>{t('Réessayer')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.bottom}>
          <View style={[styles.listHeader, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.flex}>
                <Text style={[styles.listTitle, { color: theme.text }]}>{t('Artisans disponibles')}</Text>
                <Text style={[styles.listSubtitle, { color: theme.textSecondary }]}>
                  {loading ? t('Recherche en cours…') : `${visibleArtisans.length} ${t(visibleArtisans.length === 1 ? 'résultat' : 'résultats')}`}
                </Text>
              </View>
              {loading && <ActivityIndicator color={theme.accent} />}
              {!loading && visibleArtisans.length === 0 && !error && !normalizedQuery && (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('Aucun artisan disponible à proximité.')}</Text>
              )}
              {!loading && visibleArtisans.length === 0 && artisans.length > 0 && normalizedQuery ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('Aucun résultat pour cette recherche.')}</Text>
              ) : null}
              {visibleArtisans.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artisanList}>
                  {visibleArtisans.map((artisan) => (
                    <TouchableOpacity
                      key={artisan.id}
                      style={styles.artisanChip}
                      onPress={() => setSelectedId(artisan.id)}>
                      <ArtisanAvatar
                        key={`${artisan.id}-${artisan.avatar_url ?? ''}`}
                        uri={artisan.avatar_url}
                        accent={theme.accent}
                      />
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
        </View>
      </View>
    </SafeAreaView>
  );
}

function ArtisanAvatar({ uri, accent }: { uri: string | null; accent: string }) {
  const [failed, setFailed] = useState(false);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.avatarImage}
        onError={() => setFailed(true)}
        accessibilityLabel="Photo de profil de l’artisan"
      />
    );
  }

  return (
    <View style={styles.avatar}>
      <Ionicons name="person" size={22} color={accent} />
    </View>
  );
}

function ProfileInfoRow({
  icon,
  label,
  value,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  theme: ReturnType<typeof useTheme>;
}) {
  if (!value?.trim()) return null;
  return (
    <View style={[styles.profileInfoRow, { borderBottomColor: theme.backgroundSelected }]}>
      <Ionicons name={icon} size={19} color={theme.accent} />
      <View style={styles.flex}>
        <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[styles.profileInfoValue, { color: theme.text }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e8eef5' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  heading: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 11, elevation: 5, shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  title: { color: '#101828', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#667085', fontSize: 12, marginTop: 2 },
  iconButton: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', elevation: 5, position: 'relative' },
  notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d92d20', borderWidth: 1, borderColor: '#fff' },
  notificationBadgeText: { color: '#fff', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 10 },
  searchField: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, paddingHorizontal: 12, backgroundColor: '#fff', elevation: 3 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 14 },
  categoryButton: { width: 130, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, borderRadius: 13, paddingHorizontal: 10, backgroundColor: '#fff', elevation: 3 },
  categoryButtonText: { flex: 1, fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 40, 0.42)' },
  categorySheet: { maxHeight: '75%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetSubtitle: { fontSize: 12, marginTop: 3 },
  categoryOptions: { gap: 8, paddingBottom: 10 },
  categoryOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13 },
  categoryOptionText: { flex: 1, fontSize: 14, fontWeight: '600' },
  mapArea: { flex: 1, position: 'relative' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 10 },
  listHeader: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 8, elevation: 7, shadowColor: '#101828', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  listTitle: { color: '#101828', fontSize: 15, fontWeight: '800' },
  listSubtitle: { color: '#667085', fontSize: 12, marginTop: 2 },
  emptyText: { color: '#667085', fontSize: 13, paddingVertical: 8 },
  artisanList: { gap: 8, paddingRight: 4 },
  artisanChip: { width: 190, borderRadius: 12, borderWidth: 1, borderColor: '#eaecf0', padding: 10, gap: 5 },
  artisanName: { color: '#101828', fontWeight: '700', fontSize: 13 },
  artisanMeta: { color: '#667085', fontSize: 11, marginTop: 3 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eaf2ff' },
  avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eaf2ff' },
  flex: { flex: 1 },
  name: { color: '#101828', fontSize: 15, fontWeight: '800' },
  meta: { color: '#667085', fontSize: 12, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: 11, fontWeight: '600' },
  distanceText: { color: '#1877F2', fontSize: 12, fontWeight: '700' },
  profileSheet: { maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 14, elevation: 14 },
  profileHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#98a2b3' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileScroll: { flexShrink: 1 },
  profileContent: { paddingBottom: 4 },
  profileInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  profileInfoLabel: { fontSize: 11, fontWeight: '600' },
  profileInfoValue: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  quoteButton: { height: 42, borderRadius: 10, backgroundColor: '#1877F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quoteText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#eef3f8' },
  placeholderText: { color: '#475467', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  retryButton: { backgroundColor: '#1877F2', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  errorBanner: { marginHorizontal: 14, borderRadius: 10, padding: 10, backgroundColor: '#fff4ed' },
  errorText: { color: '#b54708', fontSize: 12 },
});
