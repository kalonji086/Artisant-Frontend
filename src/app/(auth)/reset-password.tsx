import { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
  }>();
  const code = first(params.code);
  const tokenHash = first(params.token_hash);
  const type = first(params.type);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const recoveryPromise = useRef<{ link: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    let active = true;
    const recoveryLink = code ?? tokenHash ?? 'existing-session';
    if (!recoveryPromise.current || recoveryPromise.current.link !== recoveryLink) {
      const promise = (async () => {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (error) throw error;
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) throw new Error('Le lien de réinitialisation est invalide ou a expiré.');
        }
      })();
      recoveryPromise.current = { link: recoveryLink, promise };
    }

    recoveryPromise.current.promise
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Le lien est invalide ou a expiré.');
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [code, tokenHash, type]);

  const savePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Mot de passe trop court', 'Choisissez au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Confirmation incorrecte', 'Les deux mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      Alert.alert('Mot de passe modifié', 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.', [
        { text: 'Se connecter', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (error) {
      Alert.alert(
        'Modification impossible',
        error instanceof Error ? error.message : 'Veuillez réessayer.'
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
          <TouchableOpacity style={styles.back} onPress={() => router.replace('/(auth)/login')} accessibilityLabel="Retour à la connexion">
            <Ionicons name="arrow-back" size={22} color="#344054" />
          </TouchableOpacity>
          <View style={styles.card}>
            <Text style={styles.title}>Nouveau mot de passe</Text>
            {checking ? (
              <ActivityIndicator color="#1877F2" />
            ) : errorMessage ? (
              <>
                <Text style={styles.error}>{errorMessage}</Text>
                <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/forgot-password')}>
                  <Text style={styles.buttonText}>Demander un nouveau lien</Text>
                </TouchableOpacity>
              </>
            ) : ready ? (
              <>
                <Text style={styles.description}>Choisissez un nouveau mot de passe pour votre compte.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor="#98a2b3"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  editable={!loading}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Confirmer le mot de passe"
                  placeholderTextColor="#98a2b3"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={[styles.button, loading && styles.disabled]}
                  onPress={() => void savePassword()}
                  disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enregistrer le mot de passe</Text>}
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f3f5f8' },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  card: { padding: 22, gap: 16, borderRadius: 18, backgroundColor: '#fff', elevation: 3 },
  title: { color: '#101828', fontSize: 24, fontWeight: '800' },
  description: { color: '#667085', fontSize: 14, lineHeight: 21 },
  error: { color: '#b42318', fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 10, paddingHorizontal: 13, color: '#101828', backgroundColor: '#f8fafc', fontSize: 15 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#1877F2', paddingHorizontal: 12 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.65 },
});
