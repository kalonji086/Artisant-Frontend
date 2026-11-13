import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type RestoreCredentialsNativeModule = {
  createRestoreKey(requestJson: string): Promise<string>;
  getRestoreKey(requestJson: string): Promise<string>;
  clearRestoreKey(): Promise<void>;
};

// Null hors build natif (Expo Go, iOS, web) : l'appelant doit gérer ce cas.
export const RestoreCredentialsNative: RestoreCredentialsNativeModule | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<RestoreCredentialsNativeModule>('RestoreCredentials')
    : null;
