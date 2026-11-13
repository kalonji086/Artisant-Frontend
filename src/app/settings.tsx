import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { useSettings, type LangPref, type ThemePref } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { LegalModal } from '@/components/legal-modal';
import { registerPushToken } from '@/components/push-notifications';
import type { LegalKind } from '@/lib/legal-links';
import { uploadAvatar } from '@/lib/avatar';

const SWATCHES = ['#007AFF', '#FF6B00', '#34C759', '#AF52DE', '#FF2D55', '#5856D6', '#00B8A9', '#8E6E53'];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { t, prefs, prefsSyncError, setPrefs, resetPrefs, config, accent, colors } = useSettings();
  const userId = session?.user.id;
  const isArtisan = profile?.role === 'artisan';
  const [profileDraft, setProfileDraft] = useState<Partial<{ full_name: string; phone: string; city: string; profession: string; description: string }>>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [legal, setLegal] = useState<LegalKind | null>(null);

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[settings] état des notifications impossible:', error.message);
          return;
        }
        setPushOn(!!data?.expo_push_token);
      });
  }, [userId]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(isArtisan ? '/dashboard' : '/profile'));

  const confirmSignOut = () => {
    Alert.alert('Se déconnecter', 'Voulez-vous vraiment vous déconnecter de votre compte ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const togglePush = async (value: boolean) => {
    if (!userId) return;
    setPushBusy(true);
    if (value) {
      try {
        const result = await registerPushToken();
        if (!result.ok) {
          Alert.alert('Notifications non activées', result.reason);
        } else {
          setPushOn(true);
        }
      } catch (error) {
        Alert.alert('Activation impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
      } finally {
        setPushBusy(false);
      }
    } else {
      try {
        const { error } = await supabase.rpc('set_my_push_token', { p_token: null });
        if (error) throw error;
        setPushOn(false);
      } catch (error) {
        Alert.alert('Désactivation impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
      } finally {
        setPushBusy(false);
      }
    }
  };

  const updateProfile = async (patch: { is_available?: boolean; phone_public?: boolean }) => {
    if (!userId) return;
    try {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
      await refreshProfile();
    } catch (error) {
      Alert.alert('Mise à jour impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    }
  };

  const saveProfile = async () => {
    if (!userId) return;
    const fullName = (profileDraft.full_name ?? profile?.full_name ?? '').trim();
    if (!fullName) {
      Alert.alert('Nom requis', 'Veuillez saisir votre nom.');
      return;
    }
    if (Object.keys(profileDraft).length === 0) return;
    setProfileBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({
        ...(profileDraft.full_name !== undefined ? { full_name: fullName } : {}),
        ...(profileDraft.phone !== undefined ? { phone: profileDraft.phone.trim() || null } : {}),
        ...(profileDraft.city !== undefined ? { city: profileDraft.city.trim() || null } : {}),
        ...(isArtisan ? {
          ...(profileDraft.profession !== undefined ? { profession: profileDraft.profession.trim() || null } : {}),
          ...(profileDraft.description !== undefined ? { description: profileDraft.description.trim() || null } : {}),
        } : {}),
      }).eq('id', userId);
      if (error) throw error;
      setProfileDraft({});
      await refreshProfile();
      Alert.alert('Profil mis à jour', 'Vos informations ont été enregistrées.');
    } catch (error) {
      Alert.alert('Enregistrement impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setProfileBusy(false);
    }
  };

  const changePhoto = async () => {
    if (!userId || photoBusy) return;
    setPhotoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      await uploadAvatar(userId, result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      await refreshProfile();
    } catch (error) {
      Alert.alert('Photo non mise à jour', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePrefs = async (patch: Partial<typeof prefs>) => {
    try {
      await setPrefs(patch);
    } catch (error) {
      Alert.alert('Synchronisation impossible', error instanceof Error ? error.message : 'La préférence reste appliquée sur cet appareil.');
    }
  };

  const restorePrefs = async () => {
    try {
      await resetPrefs();
    } catch (error) {
      Alert.alert('Synchronisation impossible', error instanceof Error ? error.message : 'Les préférences restent appliquées sur cet appareil.');
    }
  };

  const themes: { key: ThemePref; label: string }[] = [
    { key: 'default', label: t('settings.followApp') },
    { key: 'light', label: t('settings.theme.light') },
    { key: 'dark', label: t('settings.theme.dark') },
    { key: 'system', label: t('settings.theme.system') },
  ];
  const langs: { key: LangPref; label: string }[] = [
    { key: 'default', label: t('settings.followApp') },
    { key: 'fr', label: 'Français' },
    { key: 'en', label: 'English' },
  ];

  const socials = [
    ['logo-facebook', config.facebook_url],
    ['logo-instagram', config.instagram_url],
    ['logo-twitter', config.x_url],
    ['logo-linkedin', config.linkedin_url],
    ['logo-github', config.github_url],
  ].filter((s): s is [string, string] => !!s[1]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={goBack} hitSlop={12} accessibilityLabel={t('common.back')}>
          <Ionicons name="arrow-back" size={26} color={accent} />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.heading}>{t('settings.title')}</Text>
          <Text style={styles.topSubtitle}>{t('settings.followHint')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeading}>
            <Ionicons name="person-circle-outline" size={20} color={accent} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Mon profil</Text>
          </View>
          <View style={styles.profileHeader}>
            <TouchableOpacity onPress={() => void changePhoto()} disabled={photoBusy} accessibilityRole="button" accessibilityLabel="Modifier la photo de profil">
              <View style={[styles.accountAvatar, { backgroundColor: accent }]}>
                {profile?.avatar_url
                  ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                  : <Text style={styles.accountInitial}>{((profileDraft.full_name ?? profile?.full_name ?? '').trim().charAt(0) || 'A').toUpperCase()}</Text>}
                <View style={styles.avatarEdit}>
                  {photoBusy ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="camera" size={15} color="#ffffff" />}
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.flex}>
              <Text style={[styles.accountName, { color: colors.text }]}>{profile?.full_name ?? 'Mon compte'}</Text>
              <Text style={styles.accountMeta}>{session?.user.email ?? ''}</Text>
              <Text style={styles.roleBadge}>{isArtisan ? 'Compte artisan' : 'Compte client'}</Text>
            </View>
          </View>
          <Text style={styles.label}>Nom complet</Text>
          <TextInput value={profileDraft.full_name ?? profile?.full_name ?? ''} onChangeText={(full_name) => setProfileDraft((prev) => ({ ...prev, full_name }))} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Votre nom" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Téléphone</Text>
          <TextInput value={profileDraft.phone ?? profile?.phone ?? ''} onChangeText={(phone) => setProfileDraft((prev) => ({ ...prev, phone }))} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Votre téléphone" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
          <Text style={styles.label}>Ville</Text>
          <TextInput value={profileDraft.city ?? profile?.city ?? ''} onChangeText={(city) => setProfileDraft((prev) => ({ ...prev, city }))} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Votre ville" placeholderTextColor={colors.muted} />
          {isArtisan && <>
            <Text style={styles.label}>Profession</Text>
            <TextInput value={profileDraft.profession ?? profile?.profession ?? ''} onChangeText={(profession) => setProfileDraft((prev) => ({ ...prev, profession }))} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Votre profession" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Description</Text>
            <TextInput value={profileDraft.description ?? profile?.description ?? ''} onChangeText={(description) => setProfileDraft((prev) => ({ ...prev, description }))} style={[styles.input, styles.descriptionInput, { color: colors.text, borderColor: colors.border }]} placeholder="Présentez vos services" placeholderTextColor={colors.muted} multiline />
          </>}
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={() => void saveProfile()} disabled={profileBusy || Object.keys(profileDraft).length === 0}>
            {profileBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>Enregistrer mon profil</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeading}>
            <Ionicons name="color-palette-outline" size={20} color={accent} />
            <Text style={styles.cardTitle}>{t('settings.appearance')}</Text>
          </View>
          <Text style={styles.label}>{t('settings.theme')}</Text>
          <View style={styles.row}>
            {themes.map((x) => (
              <Chip key={x.key} label={x.label} active={prefs.theme === x.key} onPress={() => void changePrefs({ theme: x.key })} />
            ))}
          </View>
          <Text style={styles.label}>{t('settings.color')}</Text>
          <View style={styles.row}>
            <Chip label={t('settings.followApp')} active={prefs.accent === null} onPress={() => void changePrefs({ accent: null })} />
            {SWATCHES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => void changePrefs({ accent: c })}
                style={[styles.swatch, { backgroundColor: c }, prefs.accent === c && { borderColor: colors.text }]}>
                {prefs.accent === c && <Ionicons name="checkmark" size={16} color="#ffffff" />}
              </TouchableOpacity>
            ))}
          </View>
          {!!prefsSyncError && <Text style={styles.errorHint}>{prefsSyncError}</Text>}
          <Text style={styles.label}>{t('settings.language')}</Text>
          <View style={styles.row}>
            {langs.map((x) => (
              <Chip key={x.key} label={x.label} active={prefs.language === x.key} onPress={() => void changePrefs({ language: x.key })} />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Ionicons name="notifications-outline" size={20} color={accent} />
            <Text style={styles.cardTitle}>{t('settings.notifications')}</Text>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.value}>{t('settings.push')}</Text>
              <Text style={styles.hint}>{pushOn ? t('settings.pushOn') : t('settings.pushOff')}</Text>
            </View>
            <Switch value={pushOn} onValueChange={togglePush} disabled={pushBusy} trackColor={{ true: accent }} />
          </View>
        </View>

        {isArtisan && (
          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <Ionicons name="person-outline" size={20} color={accent} />
              <Text style={styles.cardTitle}>{t('settings.account')}</Text>
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.value, styles.flex]}>{t('settings.available')}</Text>
              <Switch value={!!profile?.is_available} onValueChange={(v) => updateProfile({ is_available: v })} trackColor={{ true: accent }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.value, styles.flex]}>{t('settings.phonePublic')}</Text>
              <Switch value={!!profile?.phone_public} onValueChange={(v) => updateProfile({ phone_public: v })} trackColor={{ true: accent }} />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Ionicons name="help-circle-outline" size={20} color={accent} />
            <Text style={styles.cardTitle}>{t('settings.platform')}</Text>
          </View>
          <Text style={styles.value}>{config.platform_name}</Text>
          {!!config.support_email && (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${config.support_email}`)}>
              <Text style={styles.link}>{t('settings.support')} : {config.support_email}</Text>
            </TouchableOpacity>
          )}
          {!!config.contact_email && (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${config.contact_email}`)}>
              <Text style={styles.link}>{t('settings.contact')} : {config.contact_email}</Text>
            </TouchableOpacity>
          )}
          {socials.length > 0 && (
            <View style={styles.row}>
              {socials.map(([icon, url]) => (
                <TouchableOpacity key={icon} onPress={() => Linking.openURL(url)} hitSlop={8}>
                  <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={26} color={accent} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={styles.hint}>● {t('settings.live')}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Ionicons name="document-text-outline" size={20} color={accent} />
            <Text style={styles.cardTitle}>{t('settings.legal')}</Text>
          </View>
          <TouchableOpacity style={styles.linkRow} onPress={() => setLegal('privacy')}>
            <Text style={styles.value}>{t('settings.privacy')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setLegal('terms')}>
            <Text style={styles.value}>{t('settings.terms')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.reset} onPress={() => void restorePrefs()}>
          <Text style={styles.resetText}>{t('settings.reset')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOut}
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter">
          <Ionicons name="log-out-outline" size={20} color="#D92D20" />
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>

      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}
    </SafeAreaView>
  );
}

const styles = themedStyles({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  heading: { fontSize: 22, fontWeight: 'bold', color: '#222' },
  topSubtitle: { color: '#777', fontSize: 12, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 14, paddingBottom: 40 },
  hint: { fontSize: 12, color: '#666' },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 2 },
  accountAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarEdit: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 4 },
  accountInitial: { color: '#fff', fontSize: 22, fontWeight: '700' },
  accountName: { color: '#222', fontSize: 16, fontWeight: '700' },
  accountMeta: { color: '#777', fontSize: 12, marginTop: 3 },
  roleBadge: { color: '#007AFF', fontSize: 11, fontWeight: '600', marginTop: 5 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: '#eeeeee' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 3 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  label: { fontSize: 13, fontWeight: '600', color: '#666' },
  value: { fontSize: 15, color: '#222' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  descriptionInput: { minHeight: 90, textAlignVertical: 'top' },
  saveButton: { minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  errorHint: { fontSize: 12, color: '#b42318' },
  link: { fontSize: 14, color: '#007AFF' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#f2f2f2', borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { color: '#333', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#ffffff' },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42, borderTopWidth: 1, borderTopColor: '#eeeeee' },
  reset: { alignItems: 'center', padding: 10 },
  resetText: { color: '#FF3B30', fontWeight: '600' },
  signOut: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F3C7C4', marginTop: 2 },
  signOutText: { color: '#D92D20', fontSize: 15, fontWeight: '700' },
});
