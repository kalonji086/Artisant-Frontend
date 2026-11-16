import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

const REASONS = [
  { value: 'no_longer_needed', label: 'Je n’utilise plus l’application' },
  { value: 'duplicate_account', label: 'J’ai un autre compte' },
  { value: 'privacy', label: 'Confidentialité et données personnelles' },
  { value: 'other', label: 'Autre raison' },
] as const;

type DeletionReason = (typeof REASONS)[number]['value'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 8;

export default function AccountDeletionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const theme = useTheme();
  const t = useTranslate();
  const [guestEmail, setGuestEmail] = useState('');
  const email = session?.user.email?.trim() ?? guestEmail.trim();
  const [reason, setReason] = useState<DeletionReason | null>(null);
  const [details, setDetails] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendVerificationCode = async () => {
    await api.post('/account/deletion-request-otp', { email });
    setOtp('');
    setOtpSent(true);
    Alert.alert(
      t('Vérifiez votre e-mail'),
      t('Si cette adresse est associée à un compte, un code de vérification lui a été envoyé.')
    );
  };

  const submit = async () => {
    if (!session && !EMAIL_RE.test(email)) {
      Alert.alert(t('Adresse e-mail invalide'), t('Saisissez une adresse e-mail valide.'));
      return;
    }
    if (!reason) {
      Alert.alert(t('Motif obligatoire'), t('Choisissez le motif de votre demande.'));
      return;
    }
    if (details.trim().length < 20) {
      Alert.alert(t('Précisions obligatoires'), t('Décrivez votre demande en au moins 20 caractères.'));
      return;
    }
    if (confirmationEmail.trim().toLowerCase() !== email.toLowerCase()) {
      Alert.alert(t('Adresse e-mail incorrecte'), t('Saisissez exactement l’adresse e-mail de votre compte.'));
      return;
    }
    if (!confirmed) {
      Alert.alert(t('Confirmation obligatoire'), t('Confirmez que vous souhaitez demander la suppression de votre compte.'));
      return;
    }
    if (!session && otpSent && !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
      Alert.alert(t('Code invalide'), t(`Saisissez le code à ${OTP_LENGTH} chiffres reçu par e-mail.`));
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      if (!session && !otpSent) {
        await sendVerificationCode();
        return;
      }
      if (!session) {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: 'recovery',
        });
        if (error) throw error;
        if (!data.session) throw new Error(t('La vérification de votre adresse e-mail a échoué.'));
        await api.setAuthToken(data.session.access_token);
      }

      const result = await api.post('/account/deletion-requests', {
        reason,
        details: details.trim(),
        confirmation_email: confirmationEmail.trim(),
      }) as { already_requested?: boolean };
      Alert.alert(
        result.already_requested ? t('Demande déjà reçue') : t('Demande envoyée'),
        result.already_requested
          ? t('Une demande de suppression de votre compte est déjà en cours de traitement.')
          : t('Votre demande a été transmise au support. Votre compte reste actif jusqu’à son traitement.')
      );
      router.back();
    } catch (error) {
      Alert.alert(
        t('Envoi impossible'),
        error instanceof Error ? error.message : t('Veuillez réessayer plus tard.')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('Retour')}>
          <Ionicons name="arrow-back" size={23} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('Demande de suppression')}</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.notice, { backgroundColor: `${theme.accent}12` }]}>
            <Ionicons name="information-circle-outline" size={22} color={theme.accent} />
            <Text style={[styles.noticeText, { color: theme.text }]}>
              {t('Cette demande sera examinée par notre équipe. Votre compte ne sera pas supprimé automatiquement à l’envoi.')}
            </Text>
          </View>

          {session ? (
            <>
              <Text style={[styles.label, { color: theme.text }]}>{t('Compte concerné')}</Text>
              <View style={[styles.accountField, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                <Ionicons name="mail-outline" size={18} color={theme.textSecondary} />
                <Text style={[styles.accountEmail, { color: theme.text }]} numberOfLines={1}>{email}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: theme.text }]}>{t('Adresse e-mail du compte *')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
                value={guestEmail}
                onChangeText={(value) => {
                  setGuestEmail(value);
                  setOtpSent(false);
                  setOtp('');
                }}
                placeholder={t('Adresse e-mail du compte')}
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                maxLength={254}
                editable={!busy && !otpSent}
              />
            </>
          )}

          <Text style={[styles.label, { color: theme.text }]}>{t('Motif de la demande *')}</Text>
          <View style={styles.reasons}>
            {REASONS.map((item) => {
              const selected = reason === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.reason,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
                    selected && { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
                  ]}
                  onPress={() => setReason(item.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}>
                  <Text style={[styles.reasonText, { color: selected ? theme.accent : theme.text }]}>{t(item.label)}</Text>
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={19} color={selected ? theme.accent : theme.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: theme.text }]}>{t('Précisions *')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
            value={details}
            onChangeText={setDetails}
            placeholder={t('Expliquez votre demande (20 caractères minimum)')}
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            accessibilityLabel={t('Précisions obligatoires')}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>{details.trim().length}/2000</Text>

          <Text style={[styles.label, { color: theme.text }]}>{t('Confirmez votre adresse e-mail *')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
            value={confirmationEmail}
            onChangeText={setConfirmationEmail}
            placeholder={email || t('Adresse e-mail du compte')}
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            maxLength={254}
            editable={!busy && (!otpSent || !!session)}
          />

          {!session && otpSent ? (
            <>
              <Text style={[styles.label, { color: theme.text }]}>{t('Code de vérification *')}</Text>
              <TextInput
                style={[styles.input, styles.otpInput, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
                value={otp}
                onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                placeholder="00000000"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={OTP_LENGTH}
                editable={!busy}
              />
            </>
          ) : null}

          <TouchableOpacity
            style={styles.confirmRow}
            onPress={() => setConfirmed((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}>
            <Ionicons name={confirmed ? 'checkbox' : 'square-outline'} size={22} color={confirmed ? theme.accent : theme.textSecondary} />
            <Text style={[styles.confirmText, { color: theme.text }]}>
              {t('Je confirme vouloir demander la suppression de mon compte et comprends que cette action sera traitée par l’équipe.')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, busy && styles.disabled]}
            onPress={() => void submit()}
            disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="trash-outline" size={18} color="#fff" />}
            <Text style={styles.submitText}>
              {busy
                ? t('Envoi…')
                : !session && !otpSent
                  ? t('Envoyer un code de vérification')
                  : !session
                    ? t('Vérifier et envoyer la demande')
                    : t('Envoyer ma demande')}
            </Text>
          </TouchableOpacity>
          {!session && otpSent ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => void sendVerificationCode().catch((error: unknown) => {
                Alert.alert(t('Envoi impossible'), error instanceof Error ? error.message : t('Veuillez réessayer plus tard.'));
              })}
              disabled={busy}>
              <Text style={[styles.cancelText, { color: theme.accent }]}>{t('Renvoyer le code')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={busy}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{t('Annuler')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 17, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 18, paddingBottom: 36, gap: 9 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 12, marginBottom: 6 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 7 },
  accountField: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  accountEmail: { flex: 1, fontSize: 14 },
  reasons: { gap: 7 },
  reason: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  reasonText: { flex: 1, fontSize: 13, lineHeight: 18 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  multiline: { minHeight: 100 },
  otpInput: { fontSize: 21, fontWeight: '700', letterSpacing: 7, textAlign: 'center' },
  counter: { alignSelf: 'flex-end', fontSize: 11 },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  confirmText: { flex: 1, fontSize: 12, lineHeight: 18 },
  submitButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: '#b42318', marginTop: 3 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '600' },
});
