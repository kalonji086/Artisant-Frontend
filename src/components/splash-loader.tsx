import { useSettings } from '@/lib/settings-context';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { AppLogo } from '@/components/app-logo';

type Props = {
  // Passe à true quand l'app est prête ; la barre se termine alors puis l'écran disparaît.
  ready: boolean;
  onDone: () => void;
  minDuration?: number;
};

export function SplashLoader({ ready, onDone, minDuration = 2200 }: Props) {
  useSettings();
  const [progress] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));
  const [minElapsed, setMinElapsed] = useState(false);

  // La barre monte jusqu'à 85 % pendant le chargement.
  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 0.85,
      duration: minDuration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    anim.start();
    const t = setTimeout(() => setMinElapsed(true), minDuration);
    return () => {
      anim.stop();
      clearTimeout(t);
    };
  }, [progress, minDuration]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    const finish = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]);
    finish.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => finish.stop();
  }, [ready, minElapsed, progress, opacity, onDone]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      <AppLogo size={150} />
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  track: {
    width: '55%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginTop: 12,
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#007AFF' },
});
