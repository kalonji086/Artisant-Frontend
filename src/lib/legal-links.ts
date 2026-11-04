import { Linking } from 'react-native';

export const TERMS_VERSION = '1.0';

// L'API est servie par le même backend que les pages légales : on retire simplement le préfixe /api/v1.
const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3000/api/v1' : '');
const ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');

export const LEGAL_URLS = {
  privacy: `${ORIGIN}/legal/privacy`,
  terms: `${ORIGIN}/legal/terms`,
} as const;

export const openLegal = (kind: keyof typeof LEGAL_URLS) => {
  void Linking.openURL(LEGAL_URLS[kind]).catch(() => undefined);
};
