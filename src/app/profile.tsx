import { themedStyles } from '@/lib/themed-styles';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const { t } = useSettings();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{profile?.full_name ?? t('profile.title')}</Text>
      <Text style={styles.subtitle}>
        {session?.user.email}
        {'\n'}
        {profile?.role === 'artisan' ? `Artisan${profile.profession ? ` · ${profile.profession}` : ''}` : t('profile.client')}
      </Text>

      {profile?.role === 'artisan' && (
        <TouchableOpacity style={styles.button} onPress={() => router.push('/dashboard')}>
          <Text style={styles.buttonText}>{t('profile.dashboard')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.button} onPress={() => router.push('/settings')}>
        <Text style={styles.buttonText}>{t('profile.settings')}</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = themedStyles({
  container: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, marginTop: 12, minWidth: 220, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
