import { StyleSheet } from 'react-native';

export type Palette = { dark: boolean; accent: string };

const DEFAULT_ACCENT = '#007AFF';
let current: Palette = { dark: false, accent: DEFAULT_ACCENT };

export const setPalette = (p: Palette) => {
  current = p;
};
export const getPalette = () => current;

// Couleurs des écrans (clairs) -> équivalent sombre.
const DARK: Record<string, string> = {
  '#fff': '#1c1c1e',
  '#ffffff': '#1c1c1e',
  '#ffffffee': '#1c1c1eee',
  '#f5f5f5': '#000000',
  '#f2f2f2': '#2c2c2e',
  '#f7f7f7': '#2c2c2e',
  '#f0f0f0': '#2c2c2e',
  '#eee': '#38383a',
  '#eeeeee': '#38383a',
  '#ddd': '#48484a',
  '#e8e8e8': '#1a1a1a',
  '#e6f0ff': '#12263f',
  '#dbe9ff': '#cfe2ff',
  '#000': '#ffffff',
  '#111': '#f2f2f7',
  '#222': '#f2f2f7',
  '#333': '#e5e5ea',
  '#444': '#d1d1d6',
  '#555': '#c7c7cc',
  '#666': '#aeaeb2',
  '#777': '#a1a1a6',
  '#888': '#98989d',
  '#999': '#8e8e93',
};

const COLOR_KEY = /color$/i;

function mapColor(value: string, p: Palette): string {
  const k = value.toLowerCase();
  if (k === '#007aff') return p.accent;
  if (p.dark && DARK[k]) return DARK[k];
  return value;
}

function mapStyle(style: Record<string, unknown>, p: Palette) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) {
    out[k] = typeof v === 'string' && COLOR_KEY.test(k) ? mapColor(v, p) : v;
  }
  return out;
}

/** Équivalent de StyleSheet.create dont les couleurs suivent le thème et la couleur principale courants. */
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(raw: T & StyleSheet.NamedStyles<any>): T {
  const cache = new Map<string, Record<string, unknown>>();
  return new Proxy(raw, {
    get(target, key) {
      const value = (target as Record<string | symbol, unknown>)[key];
      if (typeof key !== 'string' || typeof value !== 'object' || value === null) return value;
      const id = `${current.dark ? 'd' : 'l'}${current.accent}:${key}`;
      let mapped = cache.get(id);
      if (!mapped) {
        mapped = mapStyle(value as Record<string, unknown>, current);
        cache.set(id, mapped);
      }
      return mapped;
    },
  });
}

export { StyleSheet };
