import { useEffect, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { AccentColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate, useUserPreferences, type AccentColor, type ThemeMode, type AppLanguage } from '@/lib/user-preferences-context';
import { hasRegisteredPushToken, registerPushToken, unregisterPushToken } from '@/lib/push-notifications';
import * as Notifications from 'expo-notifications';

type ProfileDraft = {
  full_name: string;
  phone: string;
  city: string;
  profession: string;
  description: string;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const { preferences, loading: preferencesLoading, error: preferencesError, updatePreferences } = useUserPreferences();
  const theme = useTheme();
  const t = useTranslate();
  const userId = session?.user.id;
  const isArtisan = profile?.role === 'artisan';
  const [draft, setDraft] = useState<ProfileDraft>({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    city: profile?.city ?? '',
    profession: profile?.profession ?? '',
    description: profile?.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);

  const updateDraft = (key: keyof ProfileDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async () => {
    if (!userId || saving) return;
    if (!draft.full_name.trim()) {
      Alert.alert('Nom requis', 'Veuillez saisir votre nom complet.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: draft.full_name.trim(),
          phone: draft.phone.trim() || null,
          city: draft.city.trim() || null,
          ...(isArtisan
            ? {
                profession: draft.profession.trim() || null,
                description: draft.description.trim() || null,
              }
            : {}),
        })
        .eq('id', userId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Le profil n’a pas été modifié. Vérifiez vos droits puis réessayez.');
      await refreshProfile();
      Alert.alert('Profil enregistré', 'Vos informations ont été mises à jour.');
    } catch (error) {
      Alert.alert('Enregistrement impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (value: boolean) => {
    if (!userId || availabilityBusy) return;
    setAvailabilityBusy(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_available: value })
        .eq('id', userId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Disponibilité non modifiée. Vérifiez vos droits puis réessayez.');
      await refreshProfile();
    } catch (error) {
      Alert.alert('Mise à jour impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const savePreference = async (update: Parameters<typeof updatePreferences>[0]) => {
    if (preferencesBusy || preferencesLoading) return;
    setPreferencesBusy(true);
    try {
      await updatePreferences(update);
    } catch (error) {
      Alert.alert(
        t('Enregistrement impossible'),
        error instanceof Error ? error.message : t('Veuillez réessayer.')
      );
    } finally {
      setPreferencesBusy(false);
    }
  };

  const submitDeletionRequest = async () => {
    if (deletionBusy) return;
    setDeletionBusy(true);
    try {
      const result = await api.post('/account/deletion-requests');
      Alert.alert(
        result.already_requested ? 'Demande déjà reçue' : 'Demande envoyée',
        result.already_requested
          ? 'Une demande de suppression de votre compte est déjà en cours de traitement.'
          : 'Votre demande de suppression a été transmise à notre équipe. Votre compte reste actif jusqu’à son traitement.'
      );
    } catch (error) {
      Alert.alert(
        'Envoi impossible',
        error instanceof Error ? error.message : 'Veuillez réessayer plus tard.'
      );
    } finally {
      setDeletionBusy(false);
    }
  };

  const confirmDeletionRequest = () => {
    Alert.alert(
      'Demander la suppression du compte',
      'Votre demande sera transmise à notre équipe. Le compte ne sera pas supprimé immédiatement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer la demande',
          style: 'destructive',
          onPress: () => void submitDeletionRequest(),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.backgroundElement }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={23} color={theme.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>{t('Paramètres')}</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>{t('Personnalisez votre expérience')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {preferencesError ? (
          <Text style={styles.preferencesError}>
            {t('Préférences indisponibles')}: {preferencesError}
          </Text>
        ) : null}
        <View style={[styles.identity, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>
              {(profile?.full_name?.trim().charAt(0) || 'A').toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.name, { color: theme.text }]}>{profile?.full_name ?? t('Mon compte')}</Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>{session?.user.email ?? ''}</Text>
            <Text style={[styles.role, { color: theme.accent }]}>{isArtisan ? t('Compte artisan') : t('Compte client')}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <SectionHeading theme={theme} icon="person-circle-outline" title={t('Informations du profil')} />
          <Field theme={theme} t={t} label="Nom complet" value={draft.full_name} onChangeText={(value) => updateDraft('full_name', value)} />
          <Field theme={theme} t={t} label="Téléphone" value={draft.phone} onChangeText={(value) => updateDraft('phone', value)} keyboardType="phone-pad" />
          <Field theme={theme} t={t} label="Ville" value={draft.city} onChangeText={(value) => updateDraft('city', value)} />
          {isArtisan && (
            <>
              <Field theme={theme} t={t} label="Profession" value={draft.profession} onChangeText={(value) => updateDraft('profession', value)} />
              <Field
                theme={theme}
                t={t}
                label="Description de vos services"
                value={draft.description}
                onChangeText={(value) => updateDraft('description', value)}
                multiline
              />
            </>
          )}
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={() => void saveProfile()} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('Enregistrer')}</Text>}
          </TouchableOpacity>
        </View>

        {isArtisan && (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.availabilityRow}>
              <View style={styles.flex}>
                <SectionHeading theme={theme} icon="briefcase-outline" title={t('Disponibilité')} />
                <Text style={[styles.muted, { color: theme.textSecondary }]}>
                  {profile?.is_available ? t('Votre profil apparaît dans la recherche.') : t('Votre profil est masqué de la recherche.')}
                </Text>
              </View>
              <Switch
                value={!!profile?.is_available}
                onValueChange={(value) => void toggleAvailability(value)}
                disabled={availabilityBusy}
                trackColor={{ true: theme.accent }}
              />
            </View>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <SectionHeading theme={theme} icon="color-palette-outline" title={t('Apparence')} />
          <OptionSelector
            title={t('Thème')}
            value={preferences.theme_mode}
            disabled={preferencesBusy || preferencesLoading}
            theme={theme}
            options={[
              { value: 'system', label: t('Suivre l’appareil') },
              { value: 'light', label: t('Clair') },
              { value: 'dark', label: t('Sombre') },
            ]}
            onChange={(theme_mode) => void savePreference({ theme_mode: theme_mode as ThemeMode })}
          />
          <OptionSelector
            title={t('Couleur')}
            value={preferences.accent_color}
            disabled={preferencesBusy || preferencesLoading}
            theme={theme}
            options={[
              { value: 'blue', label: t('Bleu'), color: AccentColors.blue },
              { value: 'orange', label: t('Orange'), color: AccentColors.orange },
              { value: 'green', label: t('Vert'), color: AccentColors.green },
              { value: 'purple', label: t('Violet'), color: AccentColors.purple },
            ]}
            onChange={(accent_color) => void savePreference({ accent_color: accent_color as AccentColor })}
          />
          <OptionSelector
            title={t('Langue')}
            value={preferences.language}
            disabled={preferencesBusy || preferencesLoading}
            theme={theme}
            options={[
              { value: 'fr', label: t('Français') },
              { value: 'en', label: t('Anglais') },
            ]}
            onChange={(language) => void savePreference({ language: language as AppLanguage })}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <SectionHeading theme={theme} icon="notifications-outline" title={t('Notifications en temps réel')} />
          <PreferenceSwitch
            title={t('Être averti des nouveaux messages')}
            value={preferences.notify_messages}
            disabled={preferencesBusy || preferencesLoading}
            accent={theme.accent}
            onChange={(notify_messages) => void savePreference({ notify_messages })}
          />
          <PreferenceSwitch
            title={t('Être averti de mes demandes de devis')}
            value={preferences.notify_quotes}
            disabled={preferencesBusy || preferencesLoading}
            accent={theme.accent}
            onChange={(notify_quotes) => void savePreference({ notify_quotes })}
          />
          <PushPermissionRow userId={userId} theme={theme} t={t} />
          {preferencesLoading ? <ActivityIndicator color={theme.accent} /> : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <SectionHeading theme={theme} icon="document-text-outline" title={t('Informations légales')} />
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(auth)/legal/privacy')}>
            <Text style={[styles.linkText, { color: theme.accent }]}>{t('Politique de confidentialité')}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(auth)/legal/terms')}>
            <Text style={[styles.linkText, { color: theme.accent }]}>{t('Conditions d’utilisation')}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.accent} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <SectionHeading theme={theme} icon="shield-checkmark-outline" title={t('Zone de confidentialité')} />
          <Text style={[styles.muted, { color: theme.textSecondary }]}>
            {t('Vous pouvez transmettre une demande de suppression de votre compte à notre équipe.')}
          </Text>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
            onPress={confirmDeletionRequest}
            disabled={deletionBusy}>
            {deletionBusy ? (
              <ActivityIndicator color="#b42318" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#b42318" />
                <Text style={styles.deleteButtonText}>{t('Demander la suppression du compte')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PushPermissionRow({
  userId,
  theme,
  t,
}: {
  userId: string | undefined;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
}) {
  const [pushState, setPushState] = useState<{ userId: string; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = pushState !== null && pushState.userId === userId && pushState.enabled;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!userId) return;
    let active = true;
    const refresh = async () => {
      try {
        const [permission, registered] = await Promise.all([
          Notifications.getPermissionsAsync(),
          hasRegisteredPushToken(userId),
        ]);
        if (active) setPushState({ userId, enabled: permission.granted && registered });
      } catch (error) {
        console.warn('[push] Lecture de l’état des notifications impossible:', error);
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);

  if (Platform.OS === 'web') return null;

  const toggle = async (value: boolean) => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      if (value) {
        const permission = await registerPushToken(userId);
        if (!permission.granted) {
          setPushState({ userId, enabled: false });
          if (!permission.canAskAgain) {
            await Linking.openSettings();
          } else {
            Alert.alert(
              t('Autorisation refusée'),
              t('Autorisez les notifications système pour les activer.')
            );
          }
          return;
        }
      } else {
        await unregisterPushToken(userId);
      }
      setPushState({ userId, enabled: value });
    } catch (error) {
      Alert.alert(
        t('Notifications push indisponibles'),
        error instanceof Error ? error.message : t('Veuillez réessayer.')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.preferenceRow}>
      <View style={styles.flex}>
        <Text style={[styles.preferenceLabel, { color: theme.text }]}>{t('Notifications système')}</Text>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          {t(enabled ? 'Activées sur cet appareil' : 'Désactivées sur cet appareil')}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <Switch
          value={enabled}
          onValueChange={(value) => void toggle(value)}
          disabled={!userId}
          trackColor={{ true: theme.accent }}
        />
      )}
    </View>
  );
}

function SectionHeading({
  icon,
  title,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={[styles.sectionIcon, { backgroundColor: `${theme.accent}18` }]}>
        <Ionicons name={icon} size={18} color={theme.accent} />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    </View>
  );
}

function Field({
  label,
  theme,
  t,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{t(label)}</Text>
      <TextInput
        {...props}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          props.multiline && styles.multiline,
        ]}
        placeholderTextColor="#98a2b3"
      />
    </View>
  );
}

function PreferenceSwitch({
  title,
  value,
  disabled,
  accent,
  onChange,
}: {
  title: string;
  value: boolean;
  disabled: boolean;
  accent: string;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.preferenceRow}>
      <Text style={[styles.preferenceLabel, { color: theme.text }]}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: accent }}
      />
    </View>
  );
}

function OptionSelector({
  title,
  value,
  disabled,
  theme,
  options,
  onChange,
}: {
  title: string;
  value: string;
  disabled: boolean;
  theme: ReturnType<typeof useTheme>;
  options: { value: string; label: string; color?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{title}</Text>
      <View style={styles.optionList}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.option,
              {
                backgroundColor: value === option.value ? theme.accent : theme.background,
                borderColor: value === option.value ? theme.accent : theme.backgroundSelected,
              },
            ]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.value }}>
            {option.color ? <View style={[styles.colorDot, { backgroundColor: option.color }]} /> : null}
            <Text style={[styles.optionText, { color: value === option.value ? '#fff' : theme.text }]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f5f8' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, backgroundColor: '#fff' },
  title: { color: '#101828', fontSize: 20, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 17, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1877F2' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { color: '#101828', fontSize: 16, fontWeight: '800' },
  muted: { color: '#667085', fontSize: 13, marginTop: 3 },
  role: { color: '#1877F2', fontSize: 12, fontWeight: '700', marginTop: 5 },
  card: { padding: 16, gap: 14, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eaecf0' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: '#101828', fontSize: 15, fontWeight: '800' },
  field: { gap: 6 },
  label: { color: '#475467', fontSize: 13, fontWeight: '600' },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 12, color: '#101828', fontSize: 15, backgroundColor: '#fff' },
  multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#1877F2' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#eaecf0' },
  linkText: { color: '#1877F2', fontWeight: '600', fontSize: 14 },
  preferencesError: { color: '#b42318', backgroundColor: '#fef3f2', padding: 12, borderRadius: 10, fontSize: 13 },
  preferenceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  preferenceLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  optionGroup: { gap: 8 },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  optionText: { fontSize: 13, fontWeight: '700' },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  deleteButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: '#fecdca', backgroundColor: '#fff', paddingHorizontal: 12 },
  deleteButtonText: { color: '#b42318', fontWeight: '700', fontSize: 14 },
});
