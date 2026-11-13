export const TERMS_VERSION = '1.0';

export type LegalKind = 'privacy' | 'terms';

export const LEGAL_TITLES: Record<LegalKind, string> = {
  privacy: 'Politique de confidentialité',
  terms: "Conditions d'utilisation",
};

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3000/api/v1' : '');

export function getLegalPageUrl(kind: LegalKind): string | null {
  const baseUrl = API_URL.replace(/\/api\/v1\/?$/i, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  return `${baseUrl}/legal/${kind}`;
}
