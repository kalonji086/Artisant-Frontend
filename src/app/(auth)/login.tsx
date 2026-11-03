import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { getCurrentCoords, saveMyLocation } from '@/lib/location';
import { PROFESSIONS } from '@/lib/professions';
import { AppLogo } from '@/components/app-logo';



type Mode = 'login' | 'signup';
type Role = 'client' | 'artisan';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('client');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [profession, setProfession] = useState(PROFESSIONS[0]);
  const [description, setDescription] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      // La redirection selon le rôle est gérée par le garde de navigation (_layout).
    } catch (err) {
      Alert.alert('Connexion impossible', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email.trim() || !password || !fullName.trim()) {
      Alert.alert('Erreur', 'Nom, email et mot de passe sont requis');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (role === 'artisan' && (!phone.trim() || !city.trim())) {
      Alert.alert('Erreur', 'Téléphone et ville sont requis pour un artisan');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Le trigger SQL handle_new_user() crée la ligne `profiles` à partir de ces métadonnées.
          data: {
            full_name: fullName.trim(),
            role,
            phone: phone.trim() || null,
            city: city.trim() || null,
            ...(role === 'artisan' ? { profession, description: description.trim() || null } : {}),
          },
        },
      });
      if (error) throw error;

      if (!data.session) {
        Alert.alert(
          'Compte créé',
          'Vérifiez votre email pour confirmer votre compte, puis connectez-vous.',
          [{ text: 'OK', onPress: () => setMode('login') }]
        );
        return;
      }

      // Position GPS du téléphone : sert à trouver les artisans proches (client)
      // ou à être trouvé (artisan). Refus de permission = pas bloquant.
      try {
        const coords = await getCurrentCoords();
        if (coords) await saveMyLocation(coords);
      } catch (err) {
        console.warn('[auth] position indisponible:', err);
      }
    } catch (err) {
      Alert.alert('Inscription impossible', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === 'signup';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <AppLogo size={96} />
            <Text style={styles.title}>Artisants</Text>
          </View>

          <Segmented
            options={[
              { value: 'login', label: 'Connexion' },
              { value: 'signup', label: 'Inscription' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as Mode)}
          />

          {isSignup && (
            <>
              <Text style={styles.sectionLabel}>Je suis</Text>
              <Segmented
                options={[
                  { value: 'client', label: 'Client' },
                  { value: 'artisan', label: 'Artisan' },
                ]}
                value={role}
                onChange={(v) => setRole(v as Role)}
              />
              <Field placeholder="Nom complet" value={fullName} onChangeText={setFullName} />
            </>
          )}

          <Field
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View>
            <Field
              placeholder="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eye} onPress={() => setShowPassword((s) => !s)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {isSignup && (
            <>
              <Field
                placeholder={role === 'artisan' ? 'Téléphone' : 'Téléphone (optionnel)'}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <Field
                placeholder={role === 'artisan' ? 'Ville' : 'Ville (optionnel)'}
                value={city}
                onChangeText={setCity}
              />

              {role === 'artisan' && (
                <>
                  <Text style={styles.sectionLabel}>Métier</Text>
                  <View style={styles.chips}>
                    {PROFESSIONS.map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.chip, profession === p && styles.chipActive]}
                        onPress={() => setProfession(p)}>
                        <Text style={[styles.chipText, profession === p && styles.chipTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Field
                    placeholder="Décrivez vos services"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    style={styles.multiline}
                  />
                </>
              )}

              <Text style={styles.hint}>
                <Ionicons name="location-outline" size={13} color="#666" /> Votre position GPS sera demandée
                pour {role === 'artisan' ? 'être trouvé par les clients proches' : 'afficher les artisans les plus proches'}.
              </Text>
            </>
          )}

          <TouchableOpacity
            style={[styles.submit, loading && styles.submitDisabled]}
            onPress={isSignup ? handleSignup : handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{isSignup ? 'Créer mon compte' : 'Se connecter'}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#999"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

function Segmented(props: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {props.options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[styles.segment, props.value === o.value && styles.segmentActive]}
          onPress={() => props.onChange(o.value)}>
          <Text style={[styles.segmentText, props.value === o.value && styles.segmentTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, gap: 14 },
  hero: { alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#222' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  eye: { position: 'absolute', right: 14, top: 14 },
  segmented: { flexDirection: 'row', backgroundColor: '#e6e6e6', borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: '#666', fontWeight: '600' },
  segmentTextActive: { color: '#007AFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { color: '#444' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 12, color: '#666' },
  submit: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
