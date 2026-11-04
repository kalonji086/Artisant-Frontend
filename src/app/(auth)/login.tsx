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
import { openLegal, TERMS_VERSION } from '@/lib/legal-links';

type Mode = 'login' | 'signup';
type Role = 'client' | 'artisan';

const GENDERS = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
];
const ARTISAN_STEPS = ['Compte', 'Identité', 'Activité', 'Validation'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** JJ/MM/AAAA -> AAAA-MM-JJ, ou null si la date n'existe pas. */
const parseBirthDate = (value: string): string | null => {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
};

const ageFrom = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now < new Date(now.getFullYear(), m - 1, d)) age -= 1;
  return age;
};

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('client');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [profession, setProfession] = useState(PROFESSIONS[0]);
  const [yearsExperience, setYearsExperience] = useState('');
  const [radiusKm, setRadiusKm] = useState('');
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

  const isArtisan = role === 'artisan';
  const lastStep = ARTISAN_STEPS.length - 1;

  /** Retourne un message d'erreur si l'étape (ou le formulaire client) est incomplète. */
  const validate = (target: number): string | null => {
    if (!isArtisan || target === 0) {
      if (!fullName.trim()) return 'Le nom complet est requis';
      if (!EMAIL_RE.test(email.trim())) return 'Adresse email invalide';
      if (password.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères';
      if (isArtisan && password !== confirmPassword) return 'Les mots de passe ne correspondent pas';
      if (phone.replace(/[^\d]/g, '').length < 6) return 'Numéro de téléphone invalide';
    }
    if (isArtisan && target === 1) {
      const iso = parseBirthDate(birthDate);
      if (!iso) return 'Date de naissance invalide (format JJ/MM/AAAA)';
      if (ageFrom(iso) < 18) return 'Vous devez avoir au moins 18 ans';
      if (!gender) return 'Veuillez choisir votre genre';
      if (!address.trim()) return "L'adresse est requise";
      if (!city.trim()) return 'La ville est requise';
      if (!country.trim()) return 'Le pays est requis';
    }
    if (isArtisan && target === 2) {
      const years = Number(yearsExperience);
      if (yearsExperience.trim() === '' || !Number.isInteger(years) || years < 0 || years > 70) {
        return "Années d'expérience invalides (0 à 70)";
      }
      const radius = Number(radiusKm);
      if (radiusKm.trim() === '' || !Number.isInteger(radius) || radius < 1 || radius > 500) {
        return "Rayon d'intervention invalide (1 à 500 km)";
      }
      if (description.trim().length < 20) return 'Décrivez vos services en au moins 20 caractères';
    }
    return null;
  };

  const nextStep = () => {
    const problem = validate(step);
    if (problem) {
      Alert.alert('Étape incomplète', problem);
      return;
    }
    setStep((s) => s + 1);
  };

  const handleSignup = async () => {
    // Revalide toutes les étapes : rien ne doit être contourné.
    const checks = isArtisan ? [0, 1, 2] : [0];
    for (const s of checks) {
      const problem = validate(s);
      if (problem) {
        if (isArtisan) setStep(s);
        Alert.alert('Formulaire incomplet', problem);
        return;
      }
    }
    if (!accepted) {
      Alert.alert('Acceptation requise', "Vous devez accepter la politique de confidentialité et les conditions d'utilisation.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Le trigger SQL handle_new_user() crée `profiles` et `profile_details` à partir de ces métadonnées.
          data: {
            full_name: fullName.trim(),
            role,
            phone: phone.trim(),
            terms_accepted_at: new Date().toISOString(),
            terms_version: TERMS_VERSION,
            ...(isArtisan
              ? {
                  birth_date: parseBirthDate(birthDate),
                  gender,
                  address: address.trim(),
                  city: city.trim(),
                  country: country.trim(),
                  profession,
                  years_experience: Number(yearsExperience),
                  service_radius_km: Number(radiusKm),
                  description: description.trim(),
                }
              : {}),
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
  const wizard = isSignup && isArtisan;
  const showAccount = !wizard || step === 0;
  const showIdentity = wizard && step === 1;
  const showActivity = wizard && step === 2;
  const showSummary = wizard && step === lastStep;
  const showSubmit = isSignup && (!wizard || step === lastStep);
  const submitBlocked = loading || (showSubmit && !accepted);

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep(0);
    setAccepted(false);
  };

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
            onChange={(v) => switchMode(v as Mode)}
          />

          {isSignup && step === 0 && (
            <>
              <Text style={styles.sectionLabel}>Je suis</Text>
              <Segmented
                options={[
                  { value: 'client', label: 'Client' },
                  { value: 'artisan', label: 'Artisan' },
                ]}
                value={role}
                onChange={(v) => {
                  setRole(v as Role);
                  setAccepted(false);
                }}
              />
            </>
          )}

          {wizard && (
            <View style={styles.stepper}>
              {ARTISAN_STEPS.map((label, i) => (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                    <Text style={[styles.stepDotText, i <= step && styles.stepDotTextActive]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {isSignup && showAccount && (
            <Field placeholder="Nom complet" value={fullName} onChangeText={setFullName} />
          )}

          {showAccount && (
            <>
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
            </>
          )}

          {isSignup && showAccount && wizard && (
            <Field
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
          )}

          {isSignup && showAccount && (
            <Field placeholder="Numéro de téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          )}

          {showIdentity && (
            <>
              <Field
                placeholder="Date de naissance (JJ/MM/AAAA)"
                value={birthDate}
                onChangeText={setBirthDate}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <Text style={styles.sectionLabel}>Genre</Text>
              <Segmented options={GENDERS} value={gender} onChange={setGender} />
              <Field placeholder="Adresse (rue, quartier)" value={address} onChangeText={setAddress} />
              <Field placeholder="Ville" value={city} onChangeText={setCity} />
              <Field placeholder="Pays" value={country} onChangeText={setCountry} />
            </>
          )}

          {showActivity && (
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
                placeholder="Années d'expérience"
                value={yearsExperience}
                onChangeText={setYearsExperience}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Field
                placeholder="Rayon d'intervention (km)"
                value={radiusKm}
                onChangeText={setRadiusKm}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Field
                placeholder="Décrivez vos services (20 caractères minimum)"
                value={description}
                onChangeText={setDescription}
                multiline
                style={styles.multiline}
              />
            </>
          )}

          {showSummary && (
            <View style={styles.summary}>
              <Text style={styles.sectionLabel}>Récapitulatif</Text>
              {(
                [
                  ['Nom', fullName],
                  ['Email', email],
                  ['Téléphone', phone],
                  ['Naissance', birthDate],
                  ['Adresse', `${address}, ${city}, ${country}`],
                  ['Métier', profession],
                  ['Expérience', `${yearsExperience} an(s)`],
                  ['Rayon', `${radiusKm} km`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <Text key={k} style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>{k} : </Text>
                  {v}
                </Text>
              ))}
            </View>
          )}

          {showSubmit && (
            <>
              <Text style={styles.hint}>
                <Ionicons name="location-outline" size={13} color="#666" /> Votre position GPS sera demandée
                pour {isArtisan ? 'être trouvé par les clients proches' : 'afficher les artisans les plus proches'}.
              </Text>
              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => setAccepted((a) => !a)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accepted }}>
                <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={24} color={accepted ? '#007AFF' : '#666'} />
                <Text style={styles.consentText}>
                  J'ai lu et j'accepte la{' '}
                  <Text style={styles.link} onPress={() => openLegal('privacy')}>politique de confidentialité</Text> et les{' '}
                  <Text style={styles.link} onPress={() => openLegal('terms')}>conditions d'utilisation</Text>.
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.buttons}>
            {wizard && step > 0 && (
              <TouchableOpacity style={styles.back} onPress={() => setStep((s) => s - 1)} disabled={loading}>
                <Text style={styles.backText}>Retour</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.submit, styles.flex, submitBlocked && styles.submitDisabled]}
              onPress={!isSignup ? handleLogin : showSubmit ? handleSignup : nextStep}
              disabled={submitBlocked}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {!isSignup ? 'Se connecter' : showSubmit ? 'Créer mon compte' : 'Continuer'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLink} onPress={() => openLegal('privacy')}>Politique de confidentialité</Text>
            <Text style={styles.footerSep}>•</Text>
            <Text style={styles.footerLink} onPress={() => openLegal('terms')}>Conditions d'utilisation</Text>
          </View>
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
  stepper: { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: '#007AFF' },
  stepDotText: { color: '#666', fontWeight: '700', fontSize: 13 },
  stepDotTextActive: { color: '#fff' },
  stepLabel: { fontSize: 11, color: '#888' },
  stepLabelActive: { color: '#007AFF', fontWeight: '700' },
  summary: { backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: '#ddd' },
  summaryRow: { fontSize: 14, color: '#222' },
  summaryKey: { fontWeight: '700', color: '#444' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  consentText: { flex: 1, fontSize: 13, color: '#444', lineHeight: 19 },
  link: { color: '#007AFF', fontWeight: '600', textDecorationLine: 'underline' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  back: { paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6e6e6' },
  backText: { color: '#444', fontWeight: '600', fontSize: 16 },
  submit: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  footerLink: { fontSize: 12, color: '#007AFF', textDecorationLine: 'underline' },
  footerSep: { fontSize: 12, color: '#999' },
});
