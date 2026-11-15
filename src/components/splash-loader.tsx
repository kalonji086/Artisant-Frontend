import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { AppLogo } from '@/components/app-logo';

type Props = {
  // Passe à true quand l'app est prête ; la barre se termine alors puis l'écran disparaît.
  ready: boolean;
  onDone: () => void;
  minDuration?: number;
};

export function SplashLoader({ ready, onDone, minDuration = 2200 }: Props) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), minDuration);
    return () => clearTimeout(t);
  }, [minDuration]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    const finish = Animated.sequence([
      Animated.delay(250),
      Animated.timing(opacity, { toValue: 0, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    finish.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => finish.stop();
  }, [ready, minElapsed, opacity, onDone]);

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      <AppLogo size={150} />
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
  },
});
