import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type View as RNView,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase-client';
import { api } from '@/lib/api';
import { getCurrentCoords, saveMyLocation } from '@/lib/location';
import { PROFESSIONS } from '@/lib/professions';
import { AppLogo } from '@/components/app-logo';
import { TERMS_VERSION } from '@/lib/legal-links';
import { LegalModal } from '@/components/legal-modal';
import { INPUT_PROPS } from '@/lib/input-colors';
import type { LegalKind } from '@/lib/legal-links';
import { SupportModal } from '@/components/support-modal';
import { useResponsive } from '@/lib/responsive';
import { registerRestoreKey } from '@/lib/restore-credentials';
import { SearchSelect } from '@/components/search-select';
import { PasswordStrengthBar } from '@/components/password-strength';
import { getCities, type City } from '@amplifiedhq/countries-atlas/cities';
import { getStates, type State } from '@amplifiedhq/countries-atlas/states';
import { AGE_OPTIONS, COUNTRIES, COUNTRY_BY_NAME, DEFAULT_DIAL, DIAL_CODES } from '@/lib/countries';
import { PASSWORD_MIN_LENGTH, getPasswordPolicyError } from '@/lib/password-strength';
import { uploadAvatar } from '@/lib/avatar';

type Mode = 'welcome' | 'login' | 'signup';
type Role = 'client' | 'artisan';

const GENDERS = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
];
const ARTISAN_STEPS = ['Compte', 'Identité', 'Activité', 'Validation'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MIN_LENGTH = 4;
const PHONE_MAX_LENGTH = 15;

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.name, label: c.name, keywords: `${c.iso2} ${c.dial}` }));
const DIAL_OPTIONS = DIAL_CODES.map((d) => ({ value: d.dial, label: d.label, keywords: d.dial }));
const AGE_SELECT_OPTIONS = AGE_OPTIONS.map((a) => ({ value: a, label: `${a} ans` }));
const PROFESSION_OPTIONS = PROFESSIONS.map((profession) => ({ value: profession, label: profession }));

const SIGNUP_COOLDOWN_MS = 60_000;

type PasswordLoginResponse = { access_token: string; refresh_token: string };
type SignupIdentifierResponse = { unavailable: boolean };

const signInWithBackend = async (email: string, password: string) => {
  const result = await api.post('/auth/login', { email, password }) as PasswordLoginResponse;
  if (!result.access_token || !result.refresh_token) {
    throw new Error('Réponse de connexion invalide.');
  }
  const { error } = await supabase.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
  if (error) throw error;
};

/**
 * Permet à un champ, placé dans le ScrollView, de demander à être remonté
 * au-dessus du clavier (Android n'ajuste pas la vue automatiquement).
 */
const FormScrollContext = createContext<((node: RNView | null) => void) | null>(null);

type FieldProps = ComponentProps<typeof TextInput> & { wrapStyle?: StyleProp<ViewStyle> };

export default function AuthScreen() {
  const { config, t } = useSettings();
  const router = useRouter();
  const responsive = useResponsive();
  const [mode, setMode] = useState<Mode>('welcome');
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [legalKind, setLegalKind] = useState<LegalKind | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [lastSignupAt, setLastSignupAt] = useState<number | null>(null);
  const [signupIdentifierCheck, setSignupIdentifierCheck] = useState<{
    key: string;
    unavailable: boolean;
    error?: string;
  } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL);
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [regions, setRegions] = useState<readonly State[]>([]);
  const [cities, setCities] = useState<readonly City[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string | undefined>(undefined);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profession, setProfession] = useState<string>(PROFESSIONS[0]);
  const [yearsExperience, setYearsExperience] = useState('');
  const [radiusKm, setRadiusKm] = useState('');
  const [description, setDescription] = useState('');

  const signupEmail = email.trim().toLowerCase();
  const signupPhoneDigits = `${dialCode}${phone}`.replace(/\D/g, '');
  const signupEmailCanCheck = EMAIL_RE.test(signupEmail) && signupEmail.length <= 254;
  const signupPhoneCanCheck = signupPhoneDigits.length >= PHONE_MIN_LENGTH && signupPhoneDigits.length <= PHONE_MAX_LENGTH;
  const signupIdentifierCheckKey = [
    signupEmailCanCheck ? signupEmail : '',
    signupPhoneCanCheck ? signupPhoneDigits : '',
  ].join('|');
  const canCheckSignupIdentifiers = signupEmailCanCheck || signupPhoneCanCheck;
  const identifierCheckCurrent = signupIdentifierCheck?.key === signupIdentifierCheckKey
    ? signupIdentifierCheck
    : null;
  const checkingSignupIdentifiers = mode === 'signup'
    && canCheckSignupIdentifiers
    && !identifierCheckCurrent;

  useEffect(() => {
    if (mode !== 'signup' || !canCheckSignupIdentifiers) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.post('/auth/signup-identifiers', {
        email: signupEmailCanCheck ? signupEmail : '',
        phone: signupPhoneCanCheck ? signupPhoneDigits : '',
      }, { signal: controller.signal })
        .then((result: SignupIdentifierResponse) => {
          setSignupIdentifierCheck({
            key: signupIdentifierCheckKey,
            unavailable: result.unavailable,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error('[auth] vérification des identifiants impossible:', error);
          setSignupIdentifierCheck({
            key: signupIdentifierCheckKey,
            unavailable: false,
            error: 'Vérification indisponible. Réessayez avant de continuer.',
          });
        });
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    mode,
    canCheckSignupIdentifiers,
    signupEmailCanCheck,
    signupEmail,
    signupPhoneCanCheck,
    signupPhoneDigits,
    signupIdentifierCheckKey,
  ]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const selectedCountry = COUNTRY_BY_NAME.get(country);
  const selectedRegion = regions.find((region) => region.code === province);
  const phoneMaxLength = Math.max(0, Math.min(PHONE_MAX_LENGTH, PHONE_MAX_LENGTH - dialCode.replace(/\D/g, '').length));
  const provinceOptions = useMemo(
    () => regions.map((region) => ({ value: region.code, label: region.name })),
    [regions],
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(cities.map((location) => location.name)))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name })),
    [cities],
  );

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      keyboardTop.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedCountry) return;
    void (async () => {
      try {
        const availableRegions = await getStates(selectedCountry.iso2);
        if (!active) return;
        setRegions(availableRegions);
        if (availableRegions.length === 0) {
          setCitiesLoading(true);
          setCities(await getCities(selectedCountry.iso2));
        }
      } catch (error) {
        if (active) {
          console.error('[auth] chargement des régions impossible:', error);
          Alert.alert('Localisation indisponible', 'Impossible de charger les régions de ce pays. Réessayez.');
        }
      } finally {
        if (active) {
          setRegionsLoading(false);
          setCitiesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedCountry]);

  useEffect(() => {
    let active = true;
    if (!selectedCountry || regionsLoading || regions.length === 0 || !selectedRegion) return;

    void getCities(selectedCountry.iso2, selectedRegion.code)
      .then((availableCities) => {
        if (active) setCities(availableCities);
      })
      .catch((error: unknown) => {
        if (active) {
          console.error('[auth] chargement des villes impossible:', error);
          Alert.alert('Localisation indisponible', 'Impossible de charger les villes de cette région. Réessayez.');
        }
      })
      .finally(() => {
        if (active) setCitiesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCountry, regions, regionsLoading, selectedRegion]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  /** Fait défiler le formulaire pour qu'un champ reste visible au-dessus du clavier. */
  const revealField = (node: RNView | null) => {
    if (!node) return;
    setTimeout(() => {
      node.measureInWindow((_x, y, _w, h) => {
        const limit = keyboardTop.current;
        if (limit === null) return;
        const overflow = y + h - limit;
        if (overflow > -16) {
          scrollRef.current?.scrollTo({ y: scrollY.current + overflow + 24, animated: true });
        }
      });
    }, 350);
  };

  const choosePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (!res.canceled && res.assets[0]) {
        setPhotoUri(res.assets[0].uri);
        setPhotoMime(res.assets[0].mimeType);
      }
    } catch (err) {
      console.error('[auth] ouverture de la galerie impossible:', err);
      Alert.alert(
        'Photo indisponible',
        err instanceof Error ? err.message : 'Impossible d’ouvrir la galerie. Vérifiez les autorisations et réessayez.',
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      await choosePhoto();
      return;
    }
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Accès à la caméra refusé',
          'Autorisez la caméra ou choisissez une photo existante dans votre galerie.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Choisir dans la galerie', onPress: () => void choosePhoto() },
          ],
        );
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (!res.canceled && res.assets[0]) {
        setPhotoUri(res.assets[0].uri);
        setPhotoMime(res.assets[0].mimeType);
      }
    } catch (err) {
      console.error('[auth] ouverture de la caméra impossible:', err);
      Alert.alert(
        'Caméra indisponible',
        'La caméra ne peut pas être ouverte sur cet appareil. Vous pouvez choisir une photo dans votre galerie.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Choisir dans la galerie', onPress: () => void choosePhoto() },
        ],
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      await signInWithBackend(email.trim(), password);
      // Enregistre la clé de restauration sans bloquer la connexion.
      registerRestoreKey().catch(() => {});
      // La redirection selon le rôle est gérée par le garde de navigation (_layout).
    } catch (err) {
      Alert.alert('Connexion impossible', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const isArtisan = role === 'artisan';
  const isClient = role === 'client';
  const lastStep = ARTISAN_STEPS.length - 1;
  const changeCountry = (value: string) => {
    if (value === country) return;
    setCountry(value);
    setProvince('');
    setCity('');
    setRegions([]);
    setCities([]);
    const selected = COUNTRY_BY_NAME.get(value);
    setRegionsLoading(!!selected);
    setCitiesLoading(false);
    if (selected?.dial) setDialCode(selected.dial);
  };
  const changeDialCode = (value: string) => {
    setDialCode(value);
    const maxLength = Math.max(0, Math.min(PHONE_MAX_LENGTH, PHONE_MAX_LENGTH - value.replace(/\D/g, '').length));
    setPhone((current) => current.slice(0, maxLength));
  };

  /** Retourne un message d'erreur si l'étape (ou le formulaire client) est incomplète. */
  const validate = (target: number): string | null => {
    if (!isArtisan || target === 0) {
      if (!fullName.trim()) return 'Le nom complet est requis';
      if (!EMAIL_RE.test(email.trim())) return 'Adresse email invalide';
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) return passwordError;
      if (isArtisan && password !== confirmPassword) return 'Les mots de passe ne correspondent pas';
      if (phone.length < PHONE_MIN_LENGTH || phone.length > phoneMaxLength) {
        return `Le numéro doit contenir entre ${PHONE_MIN_LENGTH} et ${phoneMaxLength} chiffres pour cet indicatif`;
      }
    }
    if (isArtisan && target === 1) {
      if (!photoUri) return 'Veuillez prendre votre photo de profil';
      if (!age) return 'Veuillez sélectionner votre âge';
      if (!gender) return 'Veuillez choisir votre genre';
      if (!address.trim()) return "L'adresse est requise";
      if (!city.trim()) return 'La ville est requise';
      if (!country) return 'Le pays est requis';
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
    if (!role) {
      Alert.alert('Catégorie requise', 'Choisissez d’abord si vous êtes Client ou Artisan.');
      return;
    }
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

    // This timestamp is read after the user submits, not during component rendering.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    if (lastSignupAt && now - lastSignupAt < SIGNUP_COOLDOWN_MS) {
      const waitSecs = Math.ceil((SIGNUP_COOLDOWN_MS - (now - lastSignupAt)) / 1000);
      Alert.alert('Veuillez patienter', `Un email a déjà été envoyé récemment. Réessayez dans ${waitSecs} secondes.`);
      return;
    }

    setLoading(true);
    try {
      const identifiers = await api.post('/auth/signup-identifiers', {
        email: signupEmail,
        phone: signupPhoneDigits,
      }) as SignupIdentifierResponse;
      if (identifiers.unavailable) {
        setSignupIdentifierCheck({ key: signupIdentifierCheckKey, unavailable: true });
        Alert.alert('Inscription impossible', 'Veuillez modifier les informations saisies pour continuer.');
        return;
      }

      setLastSignupAt(now);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
            phone: `${dialCode} ${phone}`,
            terms_accepted_at: new Date().toISOString(),
            terms_version: TERMS_VERSION,
            ...(isArtisan
              ? {
                  age: Number(age),
                  gender,
                  address: address.trim(),
                  city: city.trim(),
                  country,
                  province: selectedRegion?.name ?? '',
                  profession,
                  years_experience: Number(yearsExperience),
                  service_radius_km: Number(radiusKm),
                  description: description.trim(),
                }
              : { age: Number(age), city: city.trim(), country, province: selectedRegion?.name ?? '' }),
          },
        },
      });
      if (error) throw error;
      if (data.user?.identities?.length === 0) {
        setSignupIdentifierCheck({ key: signupIdentifierCheckKey, unavailable: true });
        Alert.alert('Inscription impossible', 'Veuillez modifier les informations saisies pour continuer.');
        return;
      }

      if (!data.session) {
        // Confirmation email encore active : on tente la connexion via le backend.
        try {
          await signInWithBackend(email.trim(), password);
          return;
        } catch {
          // La confirmation email peut encore être requise par la configuration Supabase.
        }
        Alert.alert('Compte créé', 'Votre compte a été créé. Désactivez « Confirm email » dans Supabase pour une connexion automatique.');
        switchMode('login');
        return;
      }

      // Session active : le garde de navigation (_layout) redirige selon le rôle
      // dès que le profil est chargé. Pas de redirection manuelle ici.
      if (data.user && photoUri) {
        try {
          await uploadAvatar(data.user.id, photoUri, photoMime);
        } catch (err) {
          console.warn('[auth] envoi de la photo impossible:', err);
        }
      }

      try {
        const coords = await getCurrentCoords();
        if (coords) await saveMyLocation(coords);
      } catch (err) {
        console.warn('[auth] position indisponible:', err);
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      const message = /already registered|already exists|duplicate|not available|database error saving new user/i.test(rawMessage)
        ? 'Veuillez modifier les informations saisies ou réessayer.'
        : rawMessage;
      if (!/rate limit|too many.*email|too many requests/i.test(message)) setLastSignupAt(null);
      if (/rate limit|too many.*email|too many requests/i.test(message)) {
        Alert.alert('Trop de demandes', 'Un email a déjà été envoyé récemment. Patientez quelques minutes avant d’essayer à nouveau.');
        return;
      }
      Alert.alert('Inscription impossible', message);
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === 'signup';
  const wizard = isSignup && isArtisan;
  const roleChosen = !isSignup || !!role;
  const showAccount = roleChosen && (!wizard || step === 0);
  const showIdentity = wizard && step === 1;
  const showActivity = wizard && step === 2;
  const showSummary = wizard && step === lastStep;
  const showSubmit = roleChosen && (!isSignup || !wizard || step === lastStep);
  const submitBlocked = loading
    || (isSignup && showSubmit && !accepted)
    || (isSignup && showSubmit && (
      checkingSignupIdentifiers
      || identifierCheckCurrent?.unavailable === true
      || !!identifierCheckCurrent?.error
    ));

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep(0);
    setAccepted(false);
  };

  const legalFooter = (
    <>
      <View style={styles.footer}>
        <Text style={styles.footerLink} onPress={() => setLegalKind('privacy')}>Politique de confidentialité</Text>
        <Text style={styles.footerSep}>•</Text>
        <Text style={styles.footerLink} onPress={() => setLegalKind('terms')}>Conditions d&apos;utilisation</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerLink} onPress={() => setSupportOpen(true)}>Aide</Text>
        <Text style={styles.footerSep}>•</Text>
        <Text style={styles.footerLink} onPress={() => setSupportOpen(true)}>Supprimer mon compte</Text>
      </View>
    </>
  );

  if (mode === 'welcome') {
    return (
      <SafeAreaView style={styles.safe}>
        <ImageBackground
          source={require('../../../assets/images/welcome-background.png')}
          resizeMode="cover"
          style={styles.welcomeBackground}
          imageStyle={styles.welcomeImage}>
          <View pointerEvents="none" style={styles.welcomeScrim} />
          <View style={[styles.welcome, { paddingHorizontal: responsive.gutter }, responsive.contentFrame]}>
            <View style={styles.welcomeHero}>
              <View style={styles.logoBadge}>
                <AppLogo size={92} />
              </View>
              <Text style={styles.title}>Artisants</Text>
              <Text style={styles.welcomeTagline}>Trouvez le bon artisan pour vos projets.</Text>
            </View>
            <View style={styles.welcomeActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => switchMode('login')}
                accessibilityRole="button">
                <Text style={styles.submitText}>Se connecter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bottomButton}
                onPress={() => (config.allow_signups ? switchMode('signup') : Alert.alert(t('signup.closed')))}
                accessibilityRole="button">
                <Text style={styles.bottomButtonText}>Créer un compte</Text>
              </TouchableOpacity>
              {legalFooter}
            </View>
          </View>
        </ImageBackground>
        <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
        <LegalModal kind={legalKind} onClose={() => setLegalKind(null)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FormScrollContext.Provider value={revealField}>
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[styles.content, { padding: responsive.gutter }, responsive.contentFrame]}
            keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backLink} onPress={() => switchMode('welcome')}>
              <Ionicons name="chevron-back" size={18} color="#007AFF" />
              <Text style={styles.backLinkText}>Accueil</Text>
            </TouchableOpacity>

            <View style={styles.hero}>
              <AppLogo size={96} />
              <Text style={styles.title}>Artisants</Text>
              <Text style={styles.authSubtitle}>
                {isSignup ? 'Créez votre compte pour commencer.' : 'Connectez-vous pour continuer.'}
              </Text>
            </View>

            {isSignup && step === 0 && (
              <>
                <Text style={styles.sectionLabel}>Je suis</Text>
                <View style={styles.roleRow}>
                  {(
                    [
                      { value: 'client', label: 'Client', icon: 'person-outline', desc: 'Je cherche un artisan' },
                      { value: 'artisan', label: 'Artisan', icon: 'construct-outline', desc: 'Je propose mes services' },
                    ] as const
                  ).map((o) => {
                    const active = role === o.value;
                    return (
                      <TouchableOpacity
                        key={o.value}
                        style={[styles.roleCard, active && styles.roleCardActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setRole(o.value);
                          setAccepted(false);
                          setStep(0);
                        }}>
                        <Ionicons name={o.icon} size={30} color={active ? '#007AFF' : '#666'} />
                        <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{o.label}</Text>
                        <Text style={styles.roleDesc}>{o.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!role && <Text style={styles.hint}>Choisissez votre catégorie pour afficher le formulaire adapté.</Text>}
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
                {isSignup && checkingSignupIdentifiers && (
                  <Text style={styles.identifierFeedback}>Vérification de vos informations…</Text>
                )}
                {isSignup && identifierCheckCurrent?.unavailable && (
                  <Text style={styles.identifierFeedback}>Veuillez modifier les informations saisies pour continuer.</Text>
                )}
                {isSignup && identifierCheckCurrent?.error && (
                  <Text style={styles.identifierFeedback}>{identifierCheckCurrent.error}</Text>
                )}

                <View style={styles.passwordBlock}>
                  <View>
                    <Field
                      placeholder={`Mot de passe (${PASSWORD_MIN_LENGTH} caractères minimum)`}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity style={styles.eye} onPress={() => setShowPassword((s) => !s)}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
                    </TouchableOpacity>
                  </View>
                  {isSignup && <PasswordStrengthBar password={password} />}
                </View>
              </>
            )}

            {!isSignup && (
              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => router.push('/(auth)/forgot-password')}
                accessibilityRole="button">
                <Text style={styles.link}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
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
              <View style={styles.phoneRow}>
                <View style={styles.dialWrap}>
                  <SearchSelect
                    label="Indicatif"
                    placeholder="+33"
                    value={dialCode}
                    options={DIAL_OPTIONS}
                    onChange={changeDialCode}
                  />
                </View>
                <Field
                  wrapStyle={styles.flex}
                  placeholder={`Numéro (${phoneMaxLength} chiffres max.)`}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, phoneMaxLength))}
                  keyboardType="phone-pad"
                  maxLength={phoneMaxLength}
                />
              </View>
            )}

            {isSignup && showAccount && isClient && (
              <>
                <SearchSelect
                  label="Âge"
                  placeholder="Sélectionnez votre âge"
                  value={age}
                  options={AGE_SELECT_OPTIONS}
                  onChange={setAge}
                />
                <SearchSelect
                  label="Pays"
                  placeholder="Rechercher votre pays"
                  value={country}
                  options={COUNTRY_OPTIONS}
                  onChange={changeCountry}
                />
                {(regionsLoading || regions.length > 0) && (
                  <SearchSelect
                    label="Province / région / territoire"
                    placeholder={regionsLoading ? 'Chargement des régions…' : 'Sélectionnez une région'}
                    value={province}
                    options={provinceOptions}
                    onChange={(value) => {
                      setProvince(value);
                      setCity('');
                      setCities([]);
                      setCitiesLoading(!!value);
                    }}
                    disabled={regionsLoading}
                  />
                )}
                <SearchSelect
                  label="Ville"
                  placeholder={
                    citiesLoading
                      ? 'Chargement des villes…'
                      : regions.length > 0 && !province
                        ? 'Sélectionnez d’abord une région'
                        : 'Rechercher ou saisir votre ville'
                  }
                  value={city}
                  options={cityOptions}
                  onChange={setCity}
                  allowCustom
                  disabled={!country || regionsLoading || citiesLoading || (regions.length > 0 && !province)}
                />
              </>
            )}

            {showIdentity && (
              <>
                <Text style={styles.sectionLabel}>Photo de profil</Text>
                <View style={styles.photoBlock}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Ionicons name="camera-outline" size={40} color="#999" />
                    </View>
                  )}
                  <View style={styles.photoActions}>
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity
                        style={[styles.photoButton, photoBusy && styles.photoButtonDisabled]}
                        onPress={() => void takePhoto()}
                        disabled={photoBusy}
                        accessibilityRole="button">
                        <Ionicons name="camera" size={18} color="#007AFF" />
                        <Text style={styles.photoButtonText}>{photoUri ? 'Reprendre ma photo' : 'Prendre une photo'}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.photoButton, photoBusy && styles.photoButtonDisabled]}
                      onPress={() => void choosePhoto()}
                      disabled={photoBusy}
                      accessibilityRole="button">
                      <Ionicons name="images-outline" size={18} color="#007AFF" />
                      <Text style={styles.photoButtonText}>Choisir dans la galerie</Text>
                    </TouchableOpacity>
                  </View>
                  {photoBusy && <ActivityIndicator color="#007AFF" />}
                  <Text style={styles.hint}>Votre visage doit être bien visible. Prenez une photo ou choisissez-en une dans votre galerie.</Text>
                </View>

                <SearchSelect
                  label="Âge"
                  placeholder="Sélectionnez votre âge"
                  value={age}
                  options={AGE_SELECT_OPTIONS}
                  onChange={setAge}
                />
                <Text style={styles.sectionLabel}>Genre</Text>
                <Segmented options={GENDERS} value={gender} onChange={setGender} />
                <Field placeholder="Adresse (rue, quartier)" value={address} onChangeText={setAddress} />
                <SearchSelect
                  label="Pays"
                  placeholder="Rechercher votre pays"
                  value={country}
                  options={COUNTRY_OPTIONS}
                  onChange={changeCountry}
                />
                {(regionsLoading || regions.length > 0) && (
                  <SearchSelect
                    label="Province / région / territoire"
                    placeholder={regionsLoading ? 'Chargement des régions…' : 'Sélectionnez une région'}
                    value={province}
                    options={provinceOptions}
                    onChange={(value) => {
                      setProvince(value);
                      setCity('');
                      setCities([]);
                      setCitiesLoading(!!value);
                    }}
                    disabled={regionsLoading}
                  />
                )}
                <SearchSelect
                  label="Ville"
                  placeholder={
                    citiesLoading
                      ? 'Chargement des villes…'
                      : regions.length > 0 && !province
                        ? 'Sélectionnez d’abord une région'
                        : 'Rechercher ou saisir votre ville'
                  }
                  value={city}
                  options={cityOptions}
                  onChange={setCity}
                  allowCustom
                  disabled={!country || regionsLoading || citiesLoading || (regions.length > 0 && !province)}
                />
              </>
            )}

            {showActivity && (
              <>
                <SearchSelect
                  label="Métier / spécialité"
                  placeholder="Rechercher votre métier"
                  value={profession}
                  options={PROFESSION_OPTIONS}
                  onChange={setProfession}
                />
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
                {photoUri && <Image source={{ uri: photoUri }} style={styles.summaryPhoto} />}
                {(
                  [
                    ['Nom', fullName],
                    ['Email', email],
                    ['Téléphone', `${dialCode} ${phone}`],
                    ['Âge', `${age} ans`],
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

            {isSignup && showSubmit && (
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
                    J&apos;ai lu et j&apos;accepte la{' '}
                    <Text style={styles.link} onPress={() => setLegalKind('privacy')}>politique de confidentialité</Text> et les{' '}
                    <Text style={styles.link} onPress={() => setLegalKind('terms')}>conditions d&apos;utilisation</Text>.
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

            <View style={styles.authSwitch}>
              <View style={styles.authDivider} />
              <Text style={styles.authSwitchText}>
                {isSignup ? 'Vous avez déjà un compte ?' : 'Vous n’avez pas encore de compte ?'}
              </Text>
              <TouchableOpacity
                style={[styles.authSwitchButton, isSignup && styles.authSwitchButtonSecondary]}
                onPress={() => {
                  if (isSignup && !config.allow_signups) {
                    Alert.alert(t('signup.closed'));
                    return;
                  }
                  switchMode(isSignup ? 'login' : 'signup');
                }}
                accessibilityRole="button">
                <Text style={[styles.authSwitchButtonText, isSignup && styles.authSwitchButtonTextSecondary]}>
                  {isSignup ? 'Se connecter' : 'Créer un compte'}
                </Text>
              </TouchableOpacity>
            </View>

            {legalFooter}
          </ScrollView>
        </FormScrollContext.Provider>
      </KeyboardAvoidingView>
      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
      <LegalModal kind={legalKind} onClose={() => setLegalKind(null)} />
    </SafeAreaView>
  );
}

function Field({ wrapStyle, onFocus, style, ...props }: FieldProps) {
  const reveal = useContext(FormScrollContext);
  const wrap = useRef<RNView>(null);
  return (
    <View ref={wrap} style={wrapStyle}>
      <TextInput
        {...INPUT_PROPS}
        {...props}
        onFocus={(e) => {
          reveal?.(wrap.current);
          onFocus?.(e);
        }}
        style={[styles.input, style]}
      />
    </View>
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

const styles = themedStyles({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, gap: 14 },
  welcomeBackground: { flex: 1, width: '100%' },
  welcomeImage: { opacity: 0.46 },
  welcomeScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.32)' },
  welcome: { flex: 1, paddingTop: 20, paddingBottom: 16, justifyContent: 'space-between' },
  welcomeHero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 },
  logoBadge: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', borderRadius: 56, backgroundColor: 'rgba(255,255,255,0.88)', marginBottom: 8 },
  welcomeTagline: { color: '#30343b', fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  welcomeActions: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  bottomButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  bottomButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backLinkText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  hero: { alignItems: 'center', gap: 6, marginBottom: 8 },
  authSubtitle: { color: '#606770', fontSize: 15, textAlign: 'center', marginTop: 2 },
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
  passwordBlock: { gap: 6 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  identifierFeedback: { color: '#b45309', fontSize: 12, marginTop: -4 },
  dialWrap: { width: 130 },
  eye: { position: 'absolute', right: 14, top: 14 },
  photoBlock: { alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ddd' },
  photo: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#eee' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: '#bbb' },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#e8f2ff' },
  photoButtonDisabled: { opacity: 0.6 },
  photoButtonText: { color: '#007AFF', fontWeight: '600' },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleCard: { flex: 1, alignItems: 'center', gap: 4, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 2, borderColor: '#ddd' },
  roleCardActive: { borderColor: '#007AFF', backgroundColor: '#e8f2ff' },
  roleLabel: { fontSize: 16, fontWeight: '700', color: '#444' },
  roleLabelActive: { color: '#007AFF' },
  roleDesc: { fontSize: 12, color: '#666', textAlign: 'center' },
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
  summaryPhoto: { width: 96, height: 96, borderRadius: 48, alignSelf: 'center', backgroundColor: '#eee' },
  summaryRow: { fontSize: 14, color: '#222' },
  summaryKey: { fontWeight: '700', color: '#444' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  consentText: { flex: 1, fontSize: 13, color: '#444', lineHeight: 19 },
  forgotPassword: { alignSelf: 'flex-end', paddingVertical: 2 },
  link: { color: '#007AFF', fontWeight: '600', textDecorationLine: 'underline' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  authSwitch: { alignItems: 'center', gap: 10, marginTop: 4 },
  authDivider: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: '#d8dce2' },
  authSwitchText: { color: '#606770', fontSize: 14, textAlign: 'center' },
  authSwitchButton: {
    width: '100%',
    backgroundColor: '#42b72a',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  authSwitchButtonSecondary: { backgroundColor: '#e7f3ff' },
  authSwitchButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  authSwitchButtonTextSecondary: { color: '#1877f2' },
  back: { paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6e6e6' },
  backText: { color: '#444', fontWeight: '600', fontSize: 16 },
  submit: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  footerLink: { fontSize: 12, color: '#007AFF', textDecorationLine: 'underline' },
  footerSep: { fontSize: 12, color: '#999' },
});
