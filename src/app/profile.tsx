import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, signOut } = useAuth();
  const theme = useTheme();
  const t = useTranslate();

  const confirmSignOut = () => {
    Alert.alert(t('Se déconnecter'), t('Voulez-vous vraiment fermer votre session ?'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Se déconnecter'),
        style: 'destructive',
        onPress: () => {
          void signOut().catch((error: unknown) => {
            console.error('[profile] Déconnexion impossible:', error);
            Alert.alert(t('Déconnexion impossible'), t('Réessayez plus tard.'));
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>
              {(profile?.full_name?.trim().charAt(0) || 'A').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{profile?.full_name ?? t('Mon profil')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{session?.user.email ?? ''}</Text>
          <Text style={[styles.role, { color: theme.accent }]}>
            {profile?.role === 'artisan'
              ? `${t('Artisan')}${profile.profession ? ` · ${profile.profession}` : ''}`
              : t('Client')}
          </Text>

          <View style={styles.details}>
            <ProfileLine theme={theme} t={t} icon="call-outline" label="Téléphone" value={profile?.phone} />
            <ProfileLine theme={theme} t={t} icon="location-outline" label="Ville" value={profile?.city} />
            {profile?.role === 'artisan' && (
              <>
                <ProfileLine theme={theme} t={t} icon="briefcase-outline" label="Profession" value={profile.profession} />
                <ProfileLine
                  theme={theme}
                  t={t}
                  icon="star-outline"
                  label="Note"
                  value={`${Number(profile.rating ?? 0).toFixed(1)} / 5`}
                />
              </>
            )}
          </View>
        </View>

        {profile?.role === 'artisan' && (
          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: theme.backgroundElement }]} onPress={() => router.push('/dashboard')}>
            <Ionicons name="grid-outline" size={19} color={theme.accent} />
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t('Ouvrir mon tableau de bord')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: theme.backgroundElement }]} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={19} color={theme.accent} />
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t('Paramètres du compte')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={confirmSignOut}>
          <Ionicons name="log-out-outline" size={19} color="#d92d20" />
          <Text style={styles.signOutText}>{t('Se déconnecter')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileLine({
  icon,
  label,
  value,
  theme,
  t,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | number | null;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={theme.textSecondary} />
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{t(label)}</Text>
      <Text style={[styles.detailValue, { color: theme.text }]}>{value || t('Non renseigné')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f5f8' },
  content: { flexGrow: 1, padding: 18, gap: 12, justifyContent: 'center' },
  card: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 22, gap: 6 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1877F2', marginBottom: 8 },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  title: { color: '#101828', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#667085', fontSize: 14, textAlign: 'center' },
  role: { color: '#1877F2', fontSize: 13, fontWeight: '700' },
  details: { alignSelf: 'stretch', gap: 14, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eaecf0' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { color: '#667085', fontSize: 13, width: 92 },
  detailValue: { flex: 1, color: '#344054', fontSize: 14, fontWeight: '600' },
  secondaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 13, backgroundColor: '#fff' },
  secondaryButtonText: { flex: 1, color: '#344054', fontSize: 14, fontWeight: '700' },
  signOutButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: '#fecdca', backgroundColor: '#fff' },
  signOutText: { color: '#d92d20', fontSize: 14, fontWeight: '700' },
});
