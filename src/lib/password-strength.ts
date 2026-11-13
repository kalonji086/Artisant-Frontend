export const PASSWORD_MIN_LENGTH = 12;

export type PasswordStrength = {
  label: 'Faible' | 'Moyen' | 'Fort' | 'Très fort';
  color: string;
  /** Proportion de la barre remplie, entre 0 et 1. */
  ratio: number;
};

/** Même règle que Supabase : minuscule, majuscule, chiffre et symbole. Retourne un message ou null. */
export function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`;
  }
  if (!/[a-z]/.test(password)) return 'Le mot de passe doit contenir une lettre minuscule';
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir une lettre majuscule';
  if (!/\d/.test(password)) return 'Le mot de passe doit contenir un chiffre';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Le mot de passe doit contenir un symbole (ex. ! @ # $ %)';
  return null;
}

/** Score sur 5 critères : longueur, longueur étendue, casse mixte, chiffre, symbole. */
export function getPasswordStrength(password: string): PasswordStrength | null {
  if (!password) return null;

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Tant que la longueur minimale n'est pas atteinte, le mot de passe reste faible.
  if (password.length < PASSWORD_MIN_LENGTH) score = Math.min(score, 1);

  if (score <= 1) return { label: 'Faible', color: '#E53935', ratio: 0.25 };
  if (score === 2) return { label: 'Faible', color: '#E53935', ratio: 0.4 };
  if (score === 3) return { label: 'Moyen', color: '#FB8C00', ratio: 0.6 };
  if (score === 4) return { label: 'Fort', color: '#43A047', ratio: 0.8 };
  return { label: 'Très fort', color: '#1B5E20', ratio: 1 };
}
