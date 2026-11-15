import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { api } from '@/lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 8;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const sendRecoveryEmail = async () => {
    const normalizedEmail = email.trim();
    if (!EMAIL_RE.test(normalizedEmail)) {
      Alert.alert('Adresse invalide', 'Saisissez une adresse email valide.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/account/password-reset-otp', { email: normalizedEmail });
      setOtp('');
      setEmailSent(true);
    } catch (error) {
      Alert.alert(
        'Envoi impossible',
        error instanceof Error ? error.message : 'Veuillez réessayer plus tard.'
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyRecoveryCode = async () => {
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
      Alert.alert('Code invalide', `Saisissez le code à ${OTP_LENGTH} chiffres reçu par email.`);
      return;
    }

    setVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: 'recovery',
      });
      if (error) throw error;
      if (!data.session) throw new Error('Le code a été accepté, mais la session de récupération est indisponible.');
      router.replace('/(auth)/reset-password');
    } catch (error) {
      Alert.alert(
        'Vérification impossible',
        error instanceof Error ? error.message : 'Le code est invalide ou expiré. Vérifiez-le puis réessayez.'
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={22} color="#344054" />
          </TouchableOpacity>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={emailSent ? 'shield-checkmark-outline' : 'key-outline'} size={28} color="#1877F2" />
            </View>
            {emailSent ? (
              <>
                <Text style={styles.title}>Saisissez votre code OTP</Text>
                <Text style={styles.description}>
                  Si cette adresse est associée à un compte, un code de {OTP_LENGTH} chiffres lui a été envoyé. Saisissez-le pour vérifier votre identité et continuer.
                </Text>
                <View style={styles.codeInputWrap}>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="00000000"
                    placeholderTextColor="#98a2b3"
                    value={otp}
                    onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={OTP_LENGTH}
                    editable={!verifying}
                    returnKeyType="done"
                    onSubmitEditing={() => void verifyRecoveryCode()}
                    accessibilityLabel={`Code de vérification à ${OTP_LENGTH} chiffres`}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.button, (verifying || otp.length !== OTP_LENGTH) && styles.disabled]}
                  onPress={() => void verifyRecoveryCode()}
                  disabled={verifying || otp.length !== OTP_LENGTH}>
                  {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Vérifier le code</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => void sendRecoveryEmail()}
                  disabled={loading || verifying}>
                  {loading ? <ActivityIndicator color="#1877F2" /> : <Text style={styles.secondaryButtonText}>Renvoyer le code</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setEmailSent(false);
                    setOtp('');
                  }}
                  disabled={verifying}>
                  <Text style={styles.secondaryButtonText}>Modifier l’adresse email</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>Mot de passe oublié ?</Text>
                <Text style={styles.description}>
                  Indiquez l’adresse email de votre compte. Nous vous enverrons un code OTP à {OTP_LENGTH} chiffres pour vérifier votre identité.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Adresse email"
                  placeholderTextColor="#98a2b3"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading}
                  returnKeyType="send"
                  onSubmitEditing={() => void sendRecoveryEmail()}
                />
                <TouchableOpacity
                  style={[styles.button, loading && styles.disabled]}
                  onPress={() => void sendRecoveryEmail()}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Envoyer le code</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f3f5f8' },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  card: { padding: 22, gap: 16, borderRadius: 18, backgroundColor: '#fff', elevation: 3 },
  iconWrap: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 27, backgroundColor: '#eff6ff' },
  title: { color: '#101828', fontSize: 24, fontWeight: '800' },
  description: { color: '#667085', fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 10, paddingHorizontal: 13, color: '#101828', backgroundColor: '#f8fafc', fontSize: 15 },
  codeInputWrap: { minHeight: 58, justifyContent: 'center', borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 10, backgroundColor: '#f8fafc' },
  codeInput: { paddingHorizontal: 13, color: '#101828', fontSize: 22, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#1877F2' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#1877F2', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.65 },
});
