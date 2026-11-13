import { Platform } from 'react-native';
import { RestoreCredentialsNative } from '../../modules/restore-credentials';
import { api } from './api';
import { supabase } from './supabase-client';

// Toutes les fonctions sont sans effet si le module natif n'est pas disponible
// (iOS, web, Expo Go) : la connexion par mot de passe reste le chemin principal.
const isAvailable = () => Platform.OS === 'android' && RestoreCredentialsNative != null;

export const registerRestoreKey = async (): Promise<void> => {
  if (!isAvailable()) return;
  const options = await api.post('/auth/restore/registration-options');
  const registrationJson = await RestoreCredentialsNative!.createRestoreKey(JSON.stringify(options));
  await api.post('/auth/restore/register', JSON.parse(registrationJson));
};

export const signInWithRestoreKey = async (): Promise<boolean> => {
  if (!isAvailable()) return false;
  const options = await api.post('/auth/restore/authentication-options');
  const assertionJson = await RestoreCredentialsNative!.getRestoreKey(JSON.stringify(options));
  const { token_hash, type } = await api.post('/auth/restore/authenticate', JSON.parse(assertionJson));
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  return !error;
};

export const clearRestoreKey = async (): Promise<void> => {
  if (!isAvailable()) return;
  await RestoreCredentialsNative!.clearRestoreKey();
};
