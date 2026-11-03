import { Image } from 'expo-image';

export function AppLogo({ size = 96, radius }: { size?: number; radius?: number }) {
  return (
    <Image
      source={require('../../assets/images/logo.png')}
      style={{ width: size, height: size, borderRadius: radius ?? size * 0.22 }}
      contentFit="contain"
    />
  );
}
