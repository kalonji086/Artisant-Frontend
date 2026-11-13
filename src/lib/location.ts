import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase-client';

export type Coords = { latitude: number; longitude: number };
export type TravelMode = 'foot' | 'bike' | 'car';

const ROUTING_HOSTS: Record<TravelMode, string> = {
  foot: 'routing.openstreetmap.de/routed-foot',
  bike: 'routing.openstreetmap.de/routed-bike',
  car: 'routing.openstreetmap.de/routed-car',
};

// GPS du téléphone (gratuit). Retourne null si la permission est refusée.
export async function getCurrentCoords(): Promise<Coords | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

// Enregistre la position sur le profil (best-effort, nécessite une session).
export async function saveMyLocation(coords: Coords): Promise<void> {
  const { error } = await supabase.rpc('set_my_location', {
    lat: coords.latitude,
    lng: coords.longitude,
  });
  if (error) console.warn('[location] enregistrement impossible:', error.message);
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export async function getRouteDistance(
  from: Coords,
  to: Coords,
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<number> {
  for (const point of [from, to]) {
    if (
      !Number.isFinite(point.latitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      !Number.isFinite(point.longitude) ||
      point.longitude < -180 ||
      point.longitude > 180
    ) {
      throw new Error('Les coordonnées de l’itinéraire sont invalides.');
    }
  }

  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  try {
    const response = await fetch(
      `https://${ROUTING_HOSTS[mode]}/route/v1/driving/${coordinates}?overview=false`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error(`Le service d’itinéraire a répondu ${response.status}.`);

    const result: unknown = await response.json();
    if (
      typeof result !== 'object' ||
      result === null ||
      !('routes' in result) ||
      !Array.isArray(result.routes) ||
      typeof result.routes[0]?.distance !== 'number'
    ) {
      throw new Error('Le service d’itinéraire n’a pas fourni de distance.');
    }

    return result.routes[0].distance;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
