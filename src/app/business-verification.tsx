import { useCallback, useEffect, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import {
  BUSINESS_PROOF_TYPES,
  removeBusinessProofs,
  uploadBusinessProof,
  type BusinessProof,
  type BusinessProofType,
  type BusinessType,
  type BusinessVerification,
} from '@/lib/business-verification';

const PROOF_LABELS: Record<BusinessProofType, string> = {
  registration: 'Preuve de création ou immatriculation',
  tax: 'Preuve fiscale',
  representative_id: 'Pièce d’identité du représentant',
  authorization: 'Mandat ou justificatif complémentaire',
};

const STATUS_LABEL_KEYS: Record<BusinessVerification['status'], string> = {
  pending: 'En attente',
  in_review: 'En examen par l’administration',
  approved: 'Approuvée',
  rejected: 'Rejetée',
};

type FormFields = {
  company_name: string;
  country: string;
  registration_number: string;
  tax_number: string;
  company_address: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
};

const EMPTY_FIELDS: FormFields = {
  company_name: '',
  country: '',
  registration_number: '',
  tax_number: '',
  company_address: '',
  contact_person: '',
  contact_email: '',
  contact_phone: '',
};

export default function BusinessVerificationScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslate();
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const [businessType, setBusinessType] = useState<BusinessType>('enterprise');
  const [fields, setFields] = useState<FormFields>({
    ...EMPTY_FIELDS,
    contact_person: profile?.full_name ?? '',
    contact_email: session?.user.email ?? '',
    contact_phone: profile?.phone ?? '',
  });
  const [proofs, setProofs] = useState<Partial<Record<BusinessProofType, BusinessProof>>>({});
  const [request, setRequest] = useState<BusinessVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRequest = useCallback(async () => {
    try {
      const response = await api.get('/account/business-verification') as {
        request: BusinessVerification | null;
      };
      setLoadError(null);
      setRequest(response.request);
    } catch (error) {
      console.error('[business-verification] Lecture impossible:', error);
      setLoadError(error instanceof Error ? error.message : 'Impossible de charger votre dossier.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.get('/account/business-verification')
      .then((response) => {
        if (!active) return;
        const result = response as { request: BusinessVerification | null };
        setLoadError(null);
        setRequest(result.request);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('[business-verification] Lecture impossible:', error);
        setLoadError(error instanceof Error ? error.message : 'Impossible de charger votre dossier.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`artisan-business-verification:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'artisan_business_verifications',
        filter: `user_id=eq.${userId}`,
      }, () => void loadRequest())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[business-verification] Actualisation en direct indisponible:', status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRequest, userId]);

  const pickProof = async (proofType: BusinessProofType) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setProofs((current) => ({
        ...current,
        [proofType]: {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? '',
          size: asset.size ?? null,
        },
      }));
    } catch (error) {
      Alert.alert(
        t('Sélection du justificatif impossible'),
        error instanceof Error ? error.message : t('Réessayez avec un autre fichier.')
      );
    }
  };

  const submit = async () => {
    if (!userId || busy) return;
    const missingField = Object.entries(fields).find(([, value]) => !value.trim());
    if (missingField) {
      Alert.alert(t('Champ obligatoire'), t('Remplissez tous les champs du formulaire.'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contact_email.trim())) {
      Alert.alert(t('E-mail invalide'), t('Saisissez une adresse e-mail de contact valide.'));
      return;
    }
    if (BUSINESS_PROOF_TYPES.some((proofType) => !proofs[proofType])) {
      Alert.alert(t('Justificatifs manquants'), t('Sélectionnez les quatre justificatifs obligatoires.'));
      return;
    }

    setBusy(true);
    const uploadedPaths: string[] = [];
    try {
      const documentPaths: Record<BusinessProofType, string> = {} as Record<BusinessProofType, string>;
      for (const proofType of BUSINESS_PROOF_TYPES) {
        const proof = proofs[proofType];
        if (!proof) throw new Error('Un justificatif obligatoire est manquant.');
        const path = await uploadBusinessProof(userId, proofType, proof);
        uploadedPaths.push(path);
        documentPaths[proofType] = path;
      }

      const response = await api.post('/account/business-verification', {
        business_type: businessType,
        ...Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, value.trim()])
        ),
        documents: documentPaths,
      }) as { request: BusinessVerification };
      setRequest(response.request);
      setProofs({});
      Alert.alert(t('Demande envoyée'), t('Votre dossier complet a été transmis pour examen.'));
    } catch (error) {
      try {
        await removeBusinessProofs(uploadedPaths);
      } catch (cleanupError) {
        console.warn('[business-verification] Nettoyage des justificatifs incomplet:', cleanupError);
      }
      Alert.alert(
        t('Envoi impossible'),
        error instanceof Error ? error.message : t('Vérifiez votre connexion puis réessayez.')
      );
    } finally {
      setBusy(false);
    }
  };

  const setField = (key: keyof FormFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('Retour')}>
          <Ionicons name="arrow-back" size={23} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('Vérification entreprise')}</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={theme.accent} />
        ) : loadError ? (
          <View style={styles.loadError}>
            <Text style={[styles.body, { color: theme.text }]}>{loadError}</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.accent }]} onPress={() => {
              setLoading(true);
              void loadRequest();
            }}>
              <Text style={styles.submitText}>{t('Réessayer')}</Text>
            </TouchableOpacity>
          </View>
        ) : request ? (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.statusCard, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons
                name={request.status === 'approved' ? 'checkmark-circle' : request.status === 'rejected' ? 'close-circle' : 'time'}
                size={30}
                color={request.status === 'approved' ? '#16a34a' : request.status === 'rejected' ? '#b42318' : '#d97706'}
              />
              <Text style={[styles.statusTitle, { color: theme.text }]}>{t(STATUS_LABEL_KEYS[request.status])}</Text>
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                {request.company_name} · {request.business_type === 'enterprise' ? t('Entreprise') : t('Sous-traitance')}
              </Text>
              {request.review_note ? (
                <Text style={[styles.reviewNote, { color: theme.text }]}>{t('Message de l’administration')} : {request.review_note}</Text>
              ) : null}
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                {t('Une seule demande est autorisée par compte. Vous pouvez revenir ici pour suivre son statut.')}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              {t('Envoyez une demande pour faire vérifier votre activité. Tous les renseignements et justificatifs sont obligatoires.')}
            </Text>

            <Text style={[styles.label, { color: theme.text }]}>{t('Statut demandé *')}</Text>
            <View style={styles.typeRow}>
              {([
                ['enterprise', 'Entreprise'],
                ['subcontractor', 'Sous-traitance'],
              ] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.typeButton,
                    { backgroundColor: theme.backgroundElement, borderColor: businessType === value ? theme.accent : theme.backgroundSelected },
                  ]}
                  onPress={() => setBusinessType(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: businessType === value }}>
                  <Text style={[styles.typeText, { color: businessType === value ? theme.accent : theme.text }]}>{t(label)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <FormField label="Nom légal de l’entreprise" value={fields.company_name} onChange={(v) => setField('company_name', v)} theme={theme} t={t} />
            <FormField label="Pays d’activité" value={fields.country} onChange={(v) => setField('country', v)} theme={theme} t={t} />
            <FormField label="Numéro d’immatriculation" value={fields.registration_number} onChange={(v) => setField('registration_number', v)} theme={theme} t={t} />
            <FormField label="Numéro fiscal" value={fields.tax_number} onChange={(v) => setField('tax_number', v)} theme={theme} t={t} />
            <FormField label="Adresse professionnelle" value={fields.company_address} onChange={(v) => setField('company_address', v)} theme={theme} t={t} />
            <FormField label="Nom du représentant" value={fields.contact_person} onChange={(v) => setField('contact_person', v)} theme={theme} t={t} />
            <FormField label="E-mail de contact" value={fields.contact_email} onChange={(v) => setField('contact_email', v)} keyboardType="email-address" autoCapitalize="none" theme={theme} t={t} />
            <FormField label="Téléphone de contact" value={fields.contact_phone} onChange={(v) => setField('contact_phone', v)} keyboardType="phone-pad" theme={theme} t={t} />

            <Text style={[styles.label, { color: theme.text }]}>{t('Justificatifs obligatoires *')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              {t('Les pièces doivent établir l’existence et l’activité de l’entreprise. Les exigences légales dépendent du pays indiqué. PDF, JPEG, PNG ou WebP, 15 Mo maximum par fichier.')}
            </Text>
            {BUSINESS_PROOF_TYPES.map((proofType) => {
              const proof = proofs[proofType];
              return (
                <TouchableOpacity
                  key={proofType}
                  style={[styles.proofButton, { backgroundColor: theme.backgroundElement, borderColor: proof ? '#16a34a' : theme.backgroundSelected }]}
                  onPress={() => void pickProof(proofType)}
                  disabled={busy}
                  accessibilityRole="button">
                  <Ionicons name={proof ? 'document-text' : 'cloud-upload-outline'} size={20} color={proof ? '#16a34a' : theme.accent} />
                  <View style={styles.flex}>
                    <Text style={[styles.proofTitle, { color: theme.text }]}>{t(PROOF_LABELS[proofType])} *</Text>
                    <Text style={[styles.proofName, { color: theme.textSecondary }]} numberOfLines={1}>
                      {proof?.name ?? t('Touchez pour sélectionner un fichier')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.accent }, busy && styles.disabled]}
              onPress={() => void submit()}
              disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send-outline" size={18} color="#fff" />}
              <Text style={styles.submitText}>{busy ? t('Envoi sécurisé…') : t('Envoyer la demande')}</Text>
            </TouchableOpacity>
            <Text style={[styles.privacyNote, { color: theme.textSecondary }]}>
              {t('Les justificatifs sont stockés dans un espace privé et accessibles uniquement à vous et aux administrateurs chargés de l’examen.')}
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({
  label,
  value,
  onChange,
  theme,
  t,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: ReturnType<typeof useTheme>;
  t: (text: string) => string;
} & Pick<React.ComponentProps<typeof TextInput>, 'keyboardType' | 'autoCapitalize'>) {
  return (
    <>
      <Text style={[styles.label, { color: theme.text }]}>{t(label)} *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={t(label)}
        placeholderTextColor={theme.textSecondary}
        maxLength={label === 'Adresse professionnelle' ? 250 : 254}
        autoCapitalize="sentences"
        {...inputProps}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 17, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  loader: { flex: 1 },
  loadError: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 10 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 18, paddingBottom: 36, gap: 8 },
  body: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 7 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 10 },
  typeText: { fontSize: 13, fontWeight: '700' },
  proofButton: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 },
  proofTitle: { fontSize: 12, fontWeight: '700' },
  proofName: { fontSize: 11, marginTop: 3 },
  submitButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 11, marginTop: 12 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  privacyNote: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  statusCard: { alignItems: 'center', borderRadius: 16, padding: 20, gap: 12, marginTop: 12 },
  statusTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  reviewNote: { width: '100%', padding: 12, borderRadius: 10, backgroundColor: '#fef3f2', fontSize: 13, lineHeight: 19 },
});
