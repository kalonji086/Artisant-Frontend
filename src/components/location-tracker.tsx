import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '@/lib/auth-context';
import { saveMyLocation } from '@/lib/location';

const MIN_INTERVAL_MS = 60_000;
const MIN_DISTANCE_M = 100;

// Envoie la position GPS du téléphone à Supabase tant que l'app est ouverte
// (clients et artisans). C'est ce qui alimente la carte en direct de l'Admin.
export function LocationTracker() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const active = !!userId && (profile?.role === 'client' || profile?.role === 'artisan');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        await saveMyLocation({
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        });
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: MIN_INTERVAL_MS,
            distanceInterval: MIN_DISTANCE_M,
          },
          (pos) => {
            void saveMyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          }
        );
        if (cancelled) sub.remove();
        else subscription = sub;
      } catch (err) {
        console.warn('[location] suivi GPS indisponible:', err);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, userId]);

  return null;
}
