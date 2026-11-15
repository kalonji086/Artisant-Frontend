import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CREDENTIALS_KEY = 'artisant.remembered-login.v1';

export async function clearRememberedCredentials(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
}
