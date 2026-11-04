export function errorMessage(err: unknown, fallback = 'Erreur inconnue'): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown };
    if (typeof e.message === 'string' && e.message) {
      if (/network request failed|failed to fetch|unable to resolve/i.test(e.message)) {
        return 'Connexion au serveur impossible. Vérifiez votre connexion internet.';
      }
      return e.message;
    }
  }
  if (typeof err === 'string' && err) return err;
  return fallback;
}
