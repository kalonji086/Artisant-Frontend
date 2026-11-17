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
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import type { EmailOtpType } from '@supabase/supabase-js';

export default function BusinessInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
  }>();
  const [initialUrl, setInitialUrl] = useState<string | null | undefined>(undefined);
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processedLink = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const subscription = Linking.addEventListener('url', ({ url }) => setIncomingUrl(url));
    Linking.getInitialURL()
      .then((url) => { if (active) setInitialUrl(url); })
      .catch((error: unknown) => {
        console.error('[business-invite] Lecture du lien impossible:', error);
        if (active) setInitialUrl(null);
      });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (initialUrl === undefined) return;
    const paramsFromLink = parseLink(incomingUrl ?? initialUrl);
    const code = first(params.code) ?? paramsFromLink.code;
    const tokenHash = first(params.token_hash) ?? paramsFromLink.token_hash;
    const type = first(params.type) ?? paramsFromLink.type;
    const accessToken = first(params.access_token) ?? paramsFromLink.access_token;
    const refreshToken = first(params.refresh_token) ?? paramsFromLink.refresh_token;
    const linkKey = [code, tokenHash, type, accessToken, refreshToken].filter(Boolean).join(':');
    if (!linkKey) {
      // This branch reports an invalid incoming deep link before starting verification.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrorMessage('Le lien d’invitation est incomplet ou a expiré.');
      setChecking(false);
      return;
    }
    if (processedLink.current === linkKey) return;
    processedLink.current = linkKey;
    let active = true;

    void (async () => {
      try {
        if (type !== 'invite' && type !== 'magiclink') {
          throw new Error('Ce lien ne correspond pas à une invitation d’équipe.');
        }
        setIsInvite(type === 'invite');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const otpType = type as EmailOtpType;
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else {
          throw new Error('Le lien ne contient pas de jeton de connexion valide.');
        }
        if (active) {
          setErrorMessage(null);
          setSessionReady(true);
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Impossible d’accepter cette invitation.');
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => { active = false; };
  }, [initialUrl, incomingUrl, params.code, params.token_hash, params.type, params.access_token, params.refresh_token]);

  const continueToWorkspace = async (setNewPassword: boolean) => {
    if (saving) return;
    if (setNewPassword && password.length < 8) {
      Alert.alert('Mot de passe trop court', 'Choisissez au moins 8 caractères.');
      return;
    }
    if (setNewPassword && password !== confirmPassword) {
      Alert.alert('Confirmation incorrecte', 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    setSaving(true);
    try {
      if (setNewPassword) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      router.replace('/business');
    } catch (error) {
      Alert.alert('Invitation non finalisée', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.back} onPress={() => router.replace('/(auth)/login')} accessibilityLabel="Retour à la connexion">
            <Ionicons name="arrow-back" size={22} color="#344054" />
          </TouchableOpacity>
          <View style={styles.card}>
            <Ionicons name="business-outline" size={36} color="#1877F2" />
            <Text style={styles.title}>Invitation à une équipe</Text>
            {checking ? (
              <ActivityIndicator color="#1877F2" />
            ) : errorMessage ? (
              <>
                <Text style={styles.error}>{errorMessage}</Text>
                <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login')}>
                  <Text style={styles.buttonText}>Se connecter</Text>
                </TouchableOpacity>
              </>
            ) : sessionReady ? (
              <>
                <Text style={styles.description}>
                  {isInvite
                    ? 'Choisissez un mot de passe pour terminer la création de votre accès employé.'
                    : 'Votre invitation est vérifiée. Vous pourrez accéder aux projets et messages de l’entreprise.'}
                </Text>
                {isInvite && (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Nouveau mot de passe (8 caractères minimum)"
                      placeholderTextColor="#98a2b3"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="newPassword"
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
                    />
                  </>
                )}
                <TouchableOpacity
                  style={[styles.button, saving && styles.disabled]}
                  onPress={() => { void continueToWorkspace(isInvite); }}
                  disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ouvrir l’espace entreprise</Text>}
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

function parseLink(url: string | null) {
  if (!url) return {};
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const hash = url.split('#')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(`${query}&${hash}`).entries());
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f5f8' },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  back: { position: 'absolute', top: 24, left: 20, zIndex: 1, padding: 8 },
  card: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 22, gap: 14 },
  title: { color: '#101828', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  description: { color: '#667085', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  input: { alignSelf: 'stretch', minHeight: 48, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 10, paddingHorizontal: 12, color: '#101828' },
  button: { minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#1877F2', padding: 12 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  error: { color: '#b42318', fontSize: 14, textAlign: 'center' },
});
