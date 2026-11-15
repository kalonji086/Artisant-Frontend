/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { AccentColors, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUserPreferences } from '@/lib/user-preferences-context';

export function useTheme() {
  const scheme = useColorScheme();
  const { preferences } = useUserPreferences();
  const theme = preferences.theme_mode === 'system'
    ? scheme === 'unspecified' ? 'light' : scheme
    : preferences.theme_mode;

  return {
    ...Colors[theme],
    accent: AccentColors[preferences.accent_color],
  };
}
