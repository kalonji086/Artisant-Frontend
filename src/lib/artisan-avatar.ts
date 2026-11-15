import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase-client';

export type ArtisanPhoto = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

const STORAGE_BUCKET = 'artisan-avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const PENDING_AVATAR_KEY = '@artisant/pending-artisan-avatar/';
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export async function uploadArtisanAvatar(userId: string, photo: ArtisanPhoto): Promise<void> {
  const mimeType = photo.mimeType?.toLowerCase() ?? 'image/jpeg';
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) {
    throw new Error('Format d’image non pris en charge. Utilisez JPEG, PNG, WebP ou HEIC.');
  }

  const response = await fetch(photo.uri);
  if (!response.ok) throw new Error('Impossible de lire la photo sélectionnée.');
  const file = await response.arrayBuffer();
  if (file.byteLength === 0 || file.byteLength > MAX_AVATAR_BYTES) {
    throw new Error('La photo doit peser moins de 5 Mo.');
  }

  const path = `${userId}/avatar.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: true, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const avatarUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (profileError) throw profileError;
  if (!data) throw new Error('Profil artisan introuvable pour enregistrer la photo.');
}

export async function savePendingArtisanAvatar(userId: string, photo: ArtisanPhoto): Promise<void> {
  await AsyncStorage.setItem(`${PENDING_AVATAR_KEY}${userId}`, JSON.stringify(photo));
}

export async function uploadPendingArtisanAvatar(userId: string): Promise<void> {
  const key = `${PENDING_AVATAR_KEY}${userId}`;
  const storedPhoto = await AsyncStorage.getItem(key);
  if (!storedPhoto) return;

  let storedValue: unknown;
  try {
    storedValue = JSON.parse(storedPhoto);
  } catch {
    await AsyncStorage.removeItem(key);
    throw new Error('La photo en attente est illisible. Veuillez la sélectionner à nouveau.');
  }
  if (
    typeof storedValue !== 'object'
    || storedValue === null
    || !('uri' in storedValue)
    || typeof storedValue.uri !== 'string'
    || !storedValue.uri
  ) {
    await AsyncStorage.removeItem(key);
    throw new Error('La photo en attente est invalide. Veuillez la sélectionner à nouveau.');
  }

  const photo: ArtisanPhoto = {
    uri: storedValue.uri,
    mimeType: 'mimeType' in storedValue && typeof storedValue.mimeType === 'string' ? storedValue.mimeType : null,
    fileName: 'fileName' in storedValue && typeof storedValue.fileName === 'string' ? storedValue.fileName : null,
  };
  await uploadArtisanAvatar(userId, photo);
  await AsyncStorage.removeItem(key);
}
