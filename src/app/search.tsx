import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { INPUT_PROPS } from '@/lib/input-colors';

type Artisan = {
  id: string;
  full_name: string;
  role: string;
  is_available: boolean;
  rating: number;
  description?: string;
};

export default function SearchScreen() {
  useSettings();
  const [query, setQuery] = useState('');
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 10;
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const lastErrorAtRef = useRef(0); // Cooldown après une erreur (anti-spam 429)

  const fetchArtisans = useCallback(
    async (append: boolean = false) => {
      if (loadingRef.current) return;
      if (append && !hasMoreRef.current) return;

      loadingRef.current = true;
      setLoading(true);
      try {
        const currentOffset = append ? offsetRef.current : 0;
        const data: any = await api.get(
          `/artisans?category=&lat=&lng=&limit=${LIMIT}&offset=${currentOffset}${
            query ? `&search=${encodeURIComponent(query)}` : ''
          }`
        );

        const results = Array.isArray(data) ? data : [];
        if (append) {
          setArtisans((prev) => [...prev, ...results]);
          offsetRef.current += LIMIT;
        } else {
          setArtisans(results);
          offsetRef.current = LIMIT;
        }
        hasMoreRef.current = results.length >= LIMIT;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erreur de recherche';
        console.error(message);
        lastErrorAtRef.current = Date.now(); // Cooldown : bloque onEndReached pendant 10s
        hasMoreRef.current = false; // Stoppe la pagination en boucle après un échec
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query]
  );

  // Debounce sur la recherche : attend 500ms après la dernière frappe avant d'appeler l'API
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (query.trim() === '') {
      offsetRef.current = 0;
      hasMoreRef.current = true;
      return;
    }

    debounceTimer.current = setTimeout(() => {
      offsetRef.current = 0;
      fetchArtisans(false);
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, fetchArtisans]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    offsetRef.current = 0;
    hasMoreRef.current = true;
    fetchArtisans(false);
  }, [fetchArtisans]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setArtisans([]);
      offsetRef.current = 0;
      hasMoreRef.current = true;
    }
  };

  const onLoadMore = () => {
    // Garde-fous anti-boucle : ne paginer que si on a déjà des résultats,
    // qu'une requête n'est pas en cours, qu'il reste des pages,
    // et pas de cooldown après une erreur (anti-spam 429).
    // Sans ça, onEndReached se déclenche en boucle sur liste vide/erreur 429.
    if (refreshing || loadingRef.current || !hasMoreRef.current) return;
    if (artisans.length === 0) return;
    if (Date.now() - lastErrorAtRef.current < 10000) return;
    fetchArtisans(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            {...INPUT_PROPS}
            style={styles.inputFlex}
            placeholder="Rechercher des artisans..."
            value={query}
            onChangeText={onQueryChange}
            autoCapitalize="none"
            autoComplete="off"
            clearButtonMode="while-editing"
          />
          {loading && <ActivityIndicator size="small" color="#007AFF" />}
        </View>
      </View>

      <FlatList
        data={artisans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-circle-outline" size={44} color="#007AFF" />
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{item.full_name}</Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      item.is_available ? styles.statusAvailable : styles.statusUnavailable,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {item.is_available ? 'Disponible' : 'Indisponible'}
                  </Text>
                </View>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color="#FF9500" />
                  <Text style={styles.cardRating}>{item.rating}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {query ? 'Aucun artisan trouvé' : 'Aucun artisan disponible'}
            </Text>
          </View>
        }
        ListFooterComponent={loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = themedStyles({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  inputFlex: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusAvailable: {
    backgroundColor: '#34C759',
  },
  statusUnavailable: {
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
  },
  cardRating: {
    fontSize: 14,
    color: '#FF9500',
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  loader: {
    padding: 16,
  },
});