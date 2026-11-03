import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase-client';

export type Coords = { latitude: number; longitude: number };

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
