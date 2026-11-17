import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

type Job = {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  description: string;
  city: string;
  work_type: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  expires_at: string | null;
  business: { company_name: string; business_type: string; country: string } | null;
  application_status: string | null;
};

type MyApplication = {
  id: string;
  message: string;
  proposed_amount: number | null;
  currency: string;
  status: string;
  created_at: string;
  business_jobs: { title: string; category: string; city: string };
};

type MyContract = {
  id: string;
  title: string;
  status: string;
  signature_provider: string;
  company_signer_name: string;
  company_signed_name: string | null;
  company_signed_at: string | null;
  artisan_signer_name: string;
  artisan_signed_name: string | null;
  artisan_signed_at: string | null;
  document_url: string;
  signed_document_url: string | null;
  business: { company_name: string } | null;
};

export default function BusinessJobsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslate();
  const { profile, session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [contracts, setContracts] = useState<MyContract[]>([]);
  const [term, setTerm] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [submittedTerm, setSubmittedTerm] = useState('');
  const [submittedCity, setSubmittedCity] = useState('');
  const [submittedCategory, setSubmittedCategory] = useState('');
  const [activeTab, setActiveTab] = useState<'jobs' | 'applications' | 'contracts'>('jobs');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedContract, setSelectedContract] = useState<MyContract | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'jobs') {
        const params = new URLSearchParams();
        if (submittedTerm) params.set('q', submittedTerm);
        if (submittedCity) params.set('city', submittedCity);
        if (submittedCategory) params.set('category', submittedCategory);
        const query = params.toString();
        const response = await api.get(`/business/jobs/search${query ? `?${query}` : ''}`) as { data: Job[] };
        setJobs(response.data);
      } else if (activeTab === 'applications') {
        const response = await api.get('/business/applications/my') as { data: MyApplication[] };
        setApplications(response.data);
      } else {
        const response = await api.get('/business/contracts/my') as { data: MyContract[] };
        setContracts(response.data);
      }
    } catch (loadError) {
      console.error('[business-jobs] Chargement impossible:', loadError);
      setError(loadError instanceof Error ? loadError.message : t('Impossible de charger les demandes.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, submittedTerm, submittedCity, submittedCategory, t]);

  useEffect(() => {
    // Load server-owned data when the artisan switches between offers and applications.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const apply = async () => {
    if (!selectedJob || busy) return;
    if (message.trim().length < 10) {
      Alert.alert(t('Candidature incomplète'), t('Présentez votre proposition en au moins 10 caractères.'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/business/jobs/${selectedJob.id}/applications`, {
        message: message.trim(),
        proposed_amount: amount,
        estimated_days: days,
      });
      setSelectedJob(null);
      setMessage('');
      setAmount('');
      setDays('');
      await load();
      Alert.alert(t('Candidature envoyée'), t('L’entreprise pourra consulter votre proposition.'));
    } catch (applyError) {
      console.error('[business-jobs] Envoi de candidature impossible:', applyError);
      Alert.alert(t('Envoi impossible'), applyError instanceof Error ? applyError.message : t('Réessayez plus tard.'));
    } finally {
      setBusy(false);
    }
  };

  const openDocument = (url?: string | null) => {
    if (!url) return;
    void Linking.openURL(url).catch((openError: unknown) => {
      Alert.alert(t('Ouverture du document impossible'), openError instanceof Error ? openError.message : t('Réessayez.'));
    });
  };

  const signContract = async () => {
    if (!selectedContract || busy) return;
    setBusy(true);
    try {
      await api.post(`/business/contracts/${selectedContract.id}/sign`, {
        full_name: signatureName.trim(),
        confirmed: signatureConfirmed,
      });
      setSelectedContract(null);
      setSignatureName('');
      setSignatureConfirmed(false);
      await load();
      Alert.alert(t('Contrat signé'), t('Votre signature a été enregistrée.'));
    } catch (signError) {
      console.error('[business-jobs] Signature du contrat impossible:', signError);
      Alert.alert(t('Signature impossible'), signError instanceof Error ? signError.message : t('Réessayez plus tard.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel={t('Retour')}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.text }]}>{t('Demandes des entreprises')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{profile?.full_name ?? t('Espace artisan')}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <Tab label="Offres disponibles" active={activeTab === 'jobs'} onPress={() => setActiveTab('jobs')} />
        <Tab label="Mes candidatures" active={activeTab === 'applications'} onPress={() => setActiveTab('applications')} />
        <Tab label="Mes contrats" active={activeTab === 'contracts'} onPress={() => setActiveTab('contracts')} />
      </View>

      {activeTab === 'jobs' && (
        <View style={styles.filters}>
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={t('Métier ou titre')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            returnKeyType="search"
            onSubmitEditing={() => {
              setSubmittedTerm(term.trim());
              setSubmittedCity(city.trim());
              setSubmittedCategory(category.trim());
            }}
          />
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder={t('Métier')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder={t('Ville')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <TouchableOpacity
            style={[styles.searchButton, { backgroundColor: theme.accent }]}
            onPress={() => {
              setSubmittedTerm(term.trim());
              setSubmittedCity(city.trim());
              setSubmittedCategory(category.trim());
            }}>
            <Text style={styles.searchButtonText}>{t('Rechercher')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        {loading && <ActivityIndicator size="large" color={theme.accent} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!loading && !error && activeTab === 'jobs' && (
          jobs.length === 0
            ? <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('Aucune offre correspondante.')}</Text>
            : jobs.map((job) => (
              <View key={job.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{job.title}</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {job.business?.company_name ?? t('Entreprise')} · {job.category} · {job.city}
                </Text>
                <Text style={[styles.body, { color: theme.text }]}>{job.description}</Text>
                {(job.budget_min !== null || job.budget_max !== null) && (
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {job.budget_min ?? '—'} – {job.budget_max ?? '—'} {job.currency}
                  </Text>
                )}
                {job.owner_id === session?.user.id ? (
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('Votre propre demande')}</Text>
                ) : job.application_status ? (
                  <Text style={[styles.status, { color: theme.accent }]}>{t('Candidature')}: {t(job.application_status)}</Text>
                ) : (
                  <TouchableOpacity style={[styles.applyButton, { backgroundColor: theme.accent }]} onPress={() => setSelectedJob(job)}>
                    <Text style={styles.searchButtonText}>{t('Postuler')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
        )}
        {!loading && !error && activeTab === 'applications' && (
          applications.length === 0
            ? <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('Vous n’avez pas encore postulé.')}</Text>
            : applications.map((application) => (
              <View key={application.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{application.business_jobs?.title ?? t('Demande entreprise')}</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {application.business_jobs?.category} · {application.business_jobs?.city} · {t(application.status)}
                </Text>
                <Text style={[styles.body, { color: theme.text }]}>{application.message}</Text>
                {application.proposed_amount !== null && (
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{application.proposed_amount} {application.currency}</Text>
                )}
              </View>
            ))
        )}
        {!loading && !error && activeTab === 'contracts' && (
            contracts.length === 0
              ? <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('Vous n’avez pas encore de contrat.')}</Text>
              : contracts.map((contract) => (
                <View key={contract.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{contract.title}</Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {contract.business?.company_name ?? t('Entreprise')} · {t(contract.status)}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {t('Entreprise')}: {contract.company_signed_at
                      ? `${contract.company_signed_name} · ${new Date(contract.company_signed_at).toLocaleString()}`
                      : `${t('En attente')} · ${contract.company_signer_name}`}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {t('Artisan')}: {contract.artisan_signed_at
                      ? `${contract.artisan_signed_name} · ${new Date(contract.artisan_signed_at).toLocaleString()}`
                      : `${t('En attente')} · ${contract.artisan_signer_name}`}
                  </Text>
                  <View style={styles.modalActions}>
                    <TouchableOpacity onPress={() => openDocument(contract.document_url)} style={[styles.modalButton, { backgroundColor: theme.backgroundSelected }]}>
                      <Text style={[styles.modalButtonText, { color: theme.text }]}>{t('Ouvrir le PDF')}</Text>
                    </TouchableOpacity>
                    {contract.signed_document_url && (
                      <TouchableOpacity onPress={() => openDocument(contract.signed_document_url)} style={[styles.modalButton, { backgroundColor: theme.backgroundSelected }]}>
                        <Text style={[styles.modalButtonText, { color: theme.text }]}>{t('Document signé')}</Text>
                      </TouchableOpacity>
                    )}
                    {contract.signature_provider === 'in_app' && !contract.artisan_signed_at && (
                      <TouchableOpacity
                        onPress={() => {
                          setSignatureName('');
                          setSignatureConfirmed(false);
                          setSelectedContract(contract);
                        }}
                        style={[styles.modalButton, { backgroundColor: theme.accent }]}>
                        <Text style={styles.modalButtonText}>{t('Signer le contrat')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
        )}
      </ScrollView>

      <Modal visible={!!selectedJob} animationType="slide" transparent onRequestClose={() => setSelectedJob(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Postuler à')} {selectedJob?.title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{selectedJob?.business?.company_name}</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t('Présentez votre expérience et votre proposition')}
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.applicationInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder={t('Montant proposé (facultatif)')}
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={days}
              onChangeText={setDays}
              placeholder={t('Durée estimée en jours (facultatif)')}
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setSelectedJob(null)} style={[styles.modalButton, { backgroundColor: theme.backgroundSelected }]}>
                <Text style={[styles.modalButtonText, { color: theme.text }]}>{t('Annuler')}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} onPress={() => { void apply(); }} style={[styles.modalButton, { backgroundColor: theme.accent }]}>
                <Text style={styles.modalButtonText}>{busy ? t('En cours…') : t('Envoyer')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedContract} animationType="slide" transparent onRequestClose={() => setSelectedContract(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Signer le contrat')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{selectedContract?.title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('Nom attendu')}: {selectedContract?.artisan_signer_name}
            </Text>
            <TouchableOpacity onPress={() => openDocument(selectedContract?.document_url)} style={[styles.modalButton, { backgroundColor: theme.backgroundSelected }]}>
              <Text style={[styles.modalButtonText, { color: theme.text }]}>{t('Lire le contrat PDF')}</Text>
            </TouchableOpacity>
            <TextInput
              value={signatureName}
              onChangeText={setSignatureName}
              placeholder={t('Saisissez votre nom complet')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              maxLength={120}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('Votre nom, votre compte et la date seront enregistrés. La signature n’est pas qualifiée et le PDF original ne sera pas modifié.')}
            </Text>
            <View style={styles.modalActions}>
              <Switch value={signatureConfirmed} onValueChange={setSignatureConfirmed} />
              <Text style={[styles.subtitle, { color: theme.text }]}>
                {t('J’ai lu le contrat et j’accepte son contenu.')}
              </Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setSelectedContract(null)} style={[styles.modalButton, { backgroundColor: theme.backgroundSelected }]}>
                <Text style={[styles.modalButtonText, { color: theme.text }]}>{t('Annuler')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy || !signatureConfirmed || signatureName.trim().length < 2}
                onPress={() => { void signContract(); }}
                style={[styles.modalButton, { backgroundColor: theme.accent, opacity: busy || !signatureConfirmed || signatureName.trim().length < 2 ? 0.6 : 1 }]}>
                <Text style={styles.modalButtonText}>{busy ? t('En cours…') : t('Confirmer la signature')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  const t = useTranslate();
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && { borderBottomColor: theme.accent }]}>
      <Text style={[styles.tabText, { color: active ? theme.accent : theme.textSecondary }]}>{t(label)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#98a2b344' },
  tab: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },
  filters: { padding: 14, gap: 8 },
  input: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: 'transparent' },
  searchButton: { minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  content: { padding: 14, paddingBottom: 30, gap: 12 },
  card: { borderRadius: 14, padding: 15, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20 },
  status: { fontSize: 13, fontWeight: '700' },
  applyButton: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  empty: { textAlign: 'center', paddingVertical: 22, fontSize: 14 },
  error: { borderRadius: 10, padding: 12, color: '#b42318', backgroundColor: '#fef3f2' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10 },
  applicationInput: { minHeight: 120, textAlignVertical: 'top', borderWidth: 1, borderRadius: 10, padding: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  modalButton: { minWidth: 100, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  modalButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
