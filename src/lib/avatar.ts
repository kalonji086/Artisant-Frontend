import { supabase } from '@/lib/supabase-client';

export const AVATAR_BUCKET = 'avatars';

/** Envoie la photo (HD, non compressée) dans le bucket puis enregistre son URL sur le profil. */
export async function uploadAvatar(userId: string, uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId);
  if (updateError) throw updateError;

  return data.publicUrl;
}
