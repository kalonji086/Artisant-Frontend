import { useMemo } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';

import { MaxContentWidth } from '@/constants/theme';

const TABLET_MIN_WIDTH = 768;
const SMALL_PHONE_MAX_WIDTH = 360;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= TABLET_MIN_WIDTH;
    const isSmall = width < SMALL_PHONE_MAX_WIDTH;

    // Très petits téléphones : texte légèrement plus petit. Tablettes : texte un peu plus grand.
    const fontFactor = isSmall ? 0.9 : isTablet ? 1.1 : 1;
    const gutter = isSmall ? 12 : isTablet ? 32 : 20;

    const frame: ViewStyle = {
      flex: 1,
      width: '100%',
      alignSelf: 'center',
      maxWidth: isTablet ? MaxContentWidth : undefined,
    };
    const contentFrame: ViewStyle = {
      width: '100%',
      alignSelf: 'center',
      maxWidth: isTablet ? MaxContentWidth : undefined,
    };

    return {
      width,
      height,
      isSmall,
      isTablet,
      gutter,
      frame,
      contentFrame,
      fs: (size: number) => Math.round(size * fontFactor),
    };
  }, [width, height]);
}
