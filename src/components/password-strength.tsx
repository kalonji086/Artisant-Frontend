import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { Text, View } from 'react-native';
import { getPasswordStrength } from '@/lib/password-strength';

/** Barre de progression du mot de passe, mise à jour à chaque caractère saisi. */
export function PasswordStrengthBar({ password }: { password: string }) {
  useSettings();
  const strength = getPasswordStrength(password);
  if (!strength) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${strength.ratio * 100}%`, backgroundColor: strength.color }]} />
      </View>
      <Text style={[styles.label, { color: strength.color }]}>
        Force du mot de passe : {strength.label}
      </Text>
    </View>
  );
}

const styles = themedStyles({
  wrap: { gap: 4, marginTop: -6 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e0e0e0', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '600' },
});
