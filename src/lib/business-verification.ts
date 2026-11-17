import { supabase } from '@/lib/supabase-client';

export type BusinessType = 'enterprise' | 'subcontractor';
export type BusinessProofType = 'registration' | 'tax' | 'representative_id' | 'authorization';
export type BusinessVerificationStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

export type BusinessVerification = {
  id: string;
  user_id: string;
  business_type: BusinessType;
  company_name: string;
  country: string;
  registration_number: string;
  tax_number: string;
  company_address: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  status: BusinessVerificationStatus;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type BusinessProof = {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
};

export const BUSINESS_PROOF_TYPES: BusinessProofType[] = [
  'registration',
  'tax',
  'representative_id',
  'authorization',
];

const STORAGE_BUCKET = 'artisan-business-proofs';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const allowedMime = (proof: BusinessProof): string => {
  const mimeType = proof.mimeType.toLowerCase();
  if (MIME_EXTENSION[mimeType]) return mimeType;
  const extension = proof.name.split('.').pop()?.toLowerCase();
  const fallback: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const inferred = extension ? fallback[extension] : undefined;
  if (!inferred) throw new Error('Format non accepté. Choisissez un fichier PDF, JPEG, PNG ou WebP.');
  return inferred;
};

export async function uploadBusinessProof(
  userId: string,
  proofType: BusinessProofType,
  proof: BusinessProof
): Promise<string> {
  if (proof.size !== null && (proof.size <= 0 || proof.size > MAX_FILE_BYTES)) {
    throw new Error('Chaque justificatif doit peser moins de 15 Mo.');
  }
  const mimeType = allowedMime(proof);
  const extension = MIME_EXTENSION[mimeType];
  const response = await fetch(proof.uri);
  if (!response.ok) throw new Error(`Impossible de lire le fichier « ${proof.name} ».`);
  const file = await response.arrayBuffer();
  if (file.byteLength === 0 || file.byteLength > MAX_FILE_BYTES) {
    throw new Error('Le fichier sélectionné est vide ou dépasse 15 Mo.');
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${proofType}_${Date.now()}_${randomSuffix}.${extension}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: false, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

export async function removeBusinessProofs(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) throw error;
}
