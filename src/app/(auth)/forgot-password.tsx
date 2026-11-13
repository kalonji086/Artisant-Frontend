import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { PasswordStrengthBar } from '@/components/password-strength';
import { INPUT_PROPS } from '@/lib/input-colors';
import { getPasswordPolicyError, PASSWORD_MIN_LENGTH } from '@/lib/password-strength';
import { supabase } from '@/lib/supabase-client';
import { api } from '@/lib/api';
import { themedStyles } from '@/lib/themed-styles';
import { useSettings } from '@/lib/settings-context';
import { useResponsive } from '@/lib/responsive';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEPS = ['Adresse email', 'Code OTP', 'Nouveau mot de passe'];

export default function ForgotPasswordScreen() {
  const { accent, colors } = useSettings();
  const responsive = useResponsive();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      Alert.alert('Adresse invalide', 'Saisissez une adresse email valide.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/password-reset/request', { email: normalizedEmail });
      setEmail(normalizedEmail);
      setOtp('');
      setStep(2);
      Alert.alert(
        'Vérifiez votre boîte mail',
        'Si un compte correspond à cette adresse, un code de vérification lui a été envoyé.',
      );
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : undefined;
      const message = status === 404
        ? 'Le service de récupération doit être mis à jour sur le serveur. Réessayez après son déploiement.'
        : error instanceof Error ? error.message : 'Réessayez plus tard.';
      Alert.alert('Envoi impossible', message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    const code = otp.replace(/\s/g, '');
    if (!/^\d{8}$/.test(code)) {
      Alert.alert('Code invalide', 'Saisissez les 8 chiffres du code reçu par email.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      });
      if (error) {
        Alert.alert('Vérification impossible', error.message);
        return;
      }
      setStep(3);
    } catch (error) {
      Alert.alert('Vérification impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async () => {
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      Alert.alert('Mot de passe invalide', passwordError);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Confirmation incorrecte', 'Les deux mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert('Modification impossible', error.message);
        return;
      }
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) console.error('[auth] fermeture de la session de récupération impossible:', signOutError.message);
      setComplete(true);
    } catch (error) {
      Alert.alert('Modification impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: responsive.gutter },
          responsive.contentFrame,
        ]}
        keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.replace('/(auth)/login')}>
          <Ionicons name="chevron-back" size={19} color={accent} />
          <Text style={[styles.backText, { color: accent }]}>Connexion</Text>
        </TouchableOpacity>

        <View style={styles.heading}>
          <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
            <Ionicons name={complete ? 'checkmark-circle-outline' : 'lock-closed-outline'} size={34} color={accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {complete ? 'Mot de passe modifié' : 'Mot de passe oublié ?'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {complete
              ? 'Votre nouveau mot de passe est enregistré. Vous pouvez vous connecter.'
              : 'Suivez les trois étapes pour sécuriser votre compte.'}
          </Text>
        </View>

        {!complete && (
          <View style={styles.stepper}>
            {STEPS.map((label, index) => {
              const number = index + 1;
              const active = step === number;
              const passed = step > number;
              return (
                <View key={label} style={styles.step}>
                  <View style={[styles.stepCircle, (active || passed) && { backgroundColor: accent, borderColor: accent }]}>
                    <Text style={[styles.stepNumber, (active || passed) && styles.stepNumberActive]}>
                      {passed ? '✓' : number}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, { color: active ? accent : colors.muted }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {!complete && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {step === 1 && (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Adresse email du compte</Text>
                <TextInput
                  {...INPUT_PROPS}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                  placeholder="exemple@email.com"
                  placeholderTextColor={colors.muted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading}
                  onSubmitEditing={() => void requestCode()}
                  accessibilityLabel="Adresse email du compte"
                />
                <Text style={[styles.help, { color: colors.muted }]}>
                  Nous vous enverrons un code à usage unique si cette adresse est associée à un compte.
                </Text>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Code de vérification</Text>
                <Text style={[styles.help, { color: colors.muted }]}>
                  Saisissez les 8 chiffres du dernier code envoyé à {email}. Chaque nouvel envoi invalide le précédent.
                </Text>
                <TextInput
                  {...INPUT_PROPS}
                  style={[styles.input, styles.otpInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                  placeholder="00000000"
                  placeholderTextColor={colors.muted}
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 8))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={8}
                  editable={!loading}
                  accessibilityLabel="Code de vérification à 8 chiffres"
                />
                <TouchableOpacity onPress={() => void requestCode()} disabled={loading} accessibilityRole="button">
                  <Text style={[styles.resend, { color: accent }]}>Renvoyer le code</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 3 && (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Nouveau mot de passe</Text>
                <TextInput
                  {...INPUT_PROPS}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                  placeholder={`Au moins ${PASSWORD_MIN_LENGTH} caractères`}
                  placeholderTextColor={colors.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!loading}
                  accessibilityLabel="Nouveau mot de passe"
                />
                <PasswordStrengthBar password={password} />
                <Text style={[styles.label, { color: colors.text }]}>Confirmer le mot de passe</Text>
                <TextInput
                  {...INPUT_PROPS}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                  placeholder="Saisissez à nouveau le mot de passe"
                  placeholderTextColor={colors.muted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!loading}
                  onSubmitEditing={() => void updatePassword()}
                  accessibilityLabel="Confirmer le nouveau mot de passe"
                />
              </>
            )}

            <View style={styles.actions}>
              {step > 1 && (
                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: colors.border }]}
                  onPress={() => setStep((current) => current - 1)}
                  disabled={loading}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Retour</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: accent, flex: 1 }]}
                onPress={() => {
                  if (step === 1) void requestCode();
                  else if (step === 2) void verifyCode();
                  else void updatePassword();
                }}
                disabled={loading}
                accessibilityRole="button">
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryText}>
                      {step === 1 ? 'Envoyer le code' : step === 2 ? 'Vérifier le code' : 'Mettre à jour'}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {complete && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accent }]}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="button">
            <Text style={styles.primaryText}>Retour à la connexion</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles({
  safe: { flex: 1 },
  content: { flexGrow: 1, gap: 24 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingVertical: 8 },
  backText: { fontSize: 15, fontWeight: '600' },
  heading: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  icon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  step: { flex: 1, alignItems: 'center', gap: 7 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#999', alignItems: 'center', justifyContent: 'center' },
  stepNumber: { color: '#666', fontSize: 13, fontWeight: '700' },
  stepNumberActive: { color: '#fff' },
  stepLabel: { fontSize: 11, textAlign: 'center' },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', borderWidth: 1, borderRadius: 16, padding: 18, gap: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: -8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16 },
  otpInput: { fontSize: 24, letterSpacing: 10, textAlign: 'center', fontWeight: '700' },
  help: { fontSize: 13, lineHeight: 19 },
  resend: { fontSize: 14, fontWeight: '600', textAlign: 'center', padding: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: { minHeight: 48, borderRadius: 11, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '600' },
});
