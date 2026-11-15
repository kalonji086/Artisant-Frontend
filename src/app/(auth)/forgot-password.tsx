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
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const sendRecoveryEmail = async () => {
    const normalizedEmail = email.trim();
    if (!EMAIL_RE.test(normalizedEmail)) {
      Alert.alert('Adresse invalide', 'Saisissez une adresse email valide.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: Linking.createURL('reset-password'),
      });
      if (error) throw error;
      Alert.alert(
        'Email envoyé',
        'Si cette adresse possède un compte, vous recevrez un lien pour réinitialiser votre mot de passe.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error) {
      Alert.alert(
        'Envoi impossible',
        error instanceof Error ? error.message : 'Veuillez réessayer plus tard.'
      );
    } finally {
      setLoading(false);
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
              <Ionicons name="key-outline" size={28} color="#1877F2" />
            </View>
            <Text style={styles.title}>Mot de passe oublié ?</Text>
            <Text style={styles.description}>
              Indiquez l’adresse email de votre compte. Nous vous enverrons un lien sécurisé pour choisir un nouveau mot de passe.
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
                <Text style={styles.buttonText}>Envoyer le lien</Text>
              )}
            </TouchableOpacity>
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
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#1877F2' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.65 },
});
