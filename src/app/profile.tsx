import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{profile?.full_name ?? 'Mon profil'}</Text>
      <Text style={styles.subtitle}>
        {session?.user.email}
        {'\n'}
        {profile?.role === 'artisan' ? `Artisan${profile.profession ? ` · ${profile.profession}` : ''}` : 'Client'}
      </Text>

      {profile?.role === 'artisan' && (
        <TouchableOpacity style={styles.button} onPress={() => router.push('/dashboard')}>
          <Text style={styles.buttonText}>Aller au Dashboard</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={signOut}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, marginTop: 12, minWidth: 220, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#FF3B30' },
  secondaryButtonText: { color: '#FF3B30' },
});
