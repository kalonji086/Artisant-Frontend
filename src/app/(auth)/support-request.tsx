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
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SupportRequestScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslate();
  const { session, profile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!fullName.trim()) {
      Alert.alert(t('Nom obligatoire'), t('Saisissez votre nom complet.'));
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      Alert.alert(t('Adresse e-mail invalide'), t('Saisissez une adresse e-mail valide.'));
      return;
    }
    if (message.trim().length < 10) {
      Alert.alert(t('Message trop court'), t('Votre message doit contenir au moins 10 caractères.'));
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      await api.post('/account/support-requests', {
        full_name: fullName.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      Alert.alert(t('Demande envoyée'), t('Votre message a été transmis au support. Nous vous répondrons par e-mail.'));
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('Écrire au support')}</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {t('Décrivez votre besoin. Vous pouvez nous contacter même sans vous connecter à votre compte.')}
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>{t('Nom complet *')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('Votre nom')}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="words"
            maxLength={120}
            editable={!busy}
          />

          <Text style={[styles.label, { color: theme.text }]}>{t('Adresse e-mail *')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
            value={email}
            onChangeText={setEmail}
            placeholder={t('Adresse e-mail pour la réponse')}
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            maxLength={254}
            editable={!busy}
          />

          <Text style={[styles.label, { color: theme.text }]}>{t('Votre message *')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('Expliquez comment nous pouvons vous aider (10 caractères minimum)')}
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            editable={!busy}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>{message.trim().length}/2000</Text>

          <TouchableOpacity
            style={[styles.submitButton, busy && styles.disabled]}
            onPress={() => void submit()}
            disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send-outline" size={18} color="#fff" />}
            <Text style={styles.submitText}>{busy ? t('Envoi…') : t('Envoyer au support')}</Text>
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
  description: { fontSize: 13, lineHeight: 20, marginBottom: 5 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 7 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  multiline: { minHeight: 150 },
  counter: { alignSelf: 'flex-end', fontSize: 11 },
  submitButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: '#1877F2', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.65 },
});
