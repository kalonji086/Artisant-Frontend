import { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

type Section =
  | 'dashboard' | 'jobs' | 'applications' | 'artisans' | 'projects'
  | 'messages' | 'contracts' | 'payments' | 'favorites' | 'reports'
  | 'team' | 'profile' | 'support';
type Row = Record<string, any>;
type FormKind = 'job' | 'payment' | 'team' | 'profile' | null;
type Field = { key: string; label: string; multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'email-address' };

const OWNER_SECTIONS: { id: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: 'grid-outline' },
  { id: 'jobs', label: 'Demandes', icon: 'briefcase-outline' },
  { id: 'applications', label: 'Candidatures', icon: 'people-outline' },
  { id: 'artisans', label: 'Rechercher un artisan', icon: 'search-outline' },
  { id: 'projects', label: 'Projets', icon: 'folder-outline' },
  { id: 'messages', label: 'Messages', icon: 'chatbubbles-outline' },
  { id: 'contracts', label: 'Contrats', icon: 'document-text-outline' },
  { id: 'payments', label: 'Paiements', icon: 'card-outline' },
  { id: 'favorites', label: 'Favoris', icon: 'star-outline' },
  { id: 'reports', label: 'Rapports', icon: 'stats-chart-outline' },
  { id: 'team', label: 'Employés', icon: 'people-circle-outline' },
  { id: 'profile', label: 'Profil entreprise', icon: 'business-outline' },
  { id: 'support', label: 'Assistance', icon: 'help-circle-outline' },
];
const EMPLOYEE_SECTIONS: typeof OWNER_SECTIONS = [
  OWNER_SECTIONS[0], OWNER_SECTIONS[4], OWNER_SECTIONS[5], OWNER_SECTIONS[12],
];

const FORM_FIELDS: Record<Exclude<FormKind, null>, Field[]> = {
  job: [
    { key: 'title', label: 'Titre de la demande' },
    { key: 'category', label: 'Métier / catégorie' },
    { key: 'city', label: 'Ville' },
    { key: 'description', label: 'Description détaillée', multiline: true },
    { key: 'budget_min', label: 'Budget minimum (facultatif)', keyboardType: 'numeric' },
    { key: 'budget_max', label: 'Budget maximum (facultatif)', keyboardType: 'numeric' },
  ],
  payment: [
    { key: 'description', label: 'Description de l’échéance' },
    { key: 'amount', label: 'Montant', keyboardType: 'numeric' },
    { key: 'due_date', label: 'Date d’échéance (AAAA-MM-JJ)' },
    { key: 'currency', label: 'Devise (ex. USD)' },
  ],
  team: [{ key: 'email', label: 'Adresse e-mail de l’employé', keyboardType: 'email-address' }],
  profile: [
    { key: 'company_name', label: 'Nom de l’entreprise' },
    { key: 'company_address', label: 'Adresse' },
    { key: 'contact_person', label: 'Personne de contact' },
    { key: 'contact_email', label: 'E-mail de contact', keyboardType: 'email-address' },
    { key: 'contact_phone', label: 'Téléphone' },
    { key: 'industry', label: 'Secteur d’activité' },
    { key: 'website', label: 'Site Web (facultatif)' },
    { key: 'description', label: 'Présentation (facultatif)', multiline: true },
  ],
};

const EMPTY_FORM: Record<string, string> = {};

export default function BusinessScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslate();
  const { profile, businessAccess } = useAuth();
  const isOwner = businessAccess?.role === 'owner';
  const sections = isOwner ? OWNER_SECTIONS : EMPLOYEE_SECTIONS;
  const [section, setSection] = useState<Section>('dashboard');
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<Row>({});
  const [businessProfile, setBusinessProfile] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchProfession, setSearchProfession] = useState('');
  const [searchCity, setSearchCity] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [submittedProfession, setSubmittedProfession] = useState('');
  const [submittedCity, setSubmittedCity] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>(EMPTY_FORM);
  const [selectedProject, setSelectedProject] = useState<Row | null>(null);
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [projectPurpose, setProjectPurpose] = useState<'payment' | 'contract' | null>(null);
  const [contractTitle, setContractTitle] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [contractFile, setContractFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [contractSignTarget, setContractSignTarget] = useState<Row | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);

  const loadSection = useCallback(async () => {
    if (!businessAccess) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (section === 'dashboard') {
        const data = await api.get('/business/dashboard') as Row;
        setResult(data);
        setBusinessProfile(data.profile ?? null);
      } else if (section === 'jobs') {
        const data = await api.get('/business/jobs') as { data: Row[] };
        setRows(data.data);
      } else if (section === 'applications') {
        const query = selectedJobId ? `?job_id=${encodeURIComponent(selectedJobId)}` : '';
        const data = await api.get(`/business/applications${query}`) as { data: Row[] };
        setRows(data.data);
      } else if (section === 'artisans') {
        const params = new URLSearchParams();
        if (submittedSearch) params.set('q', submittedSearch);
        if (submittedProfession) params.set('profession', submittedProfession);
        if (submittedCity) params.set('city', submittedCity);
        const query = params.toString();
        const data = await api.get(`/business/artisans${query ? `?${query}` : ''}`) as { data: Row[] };
        setRows(data.data);
      } else if (section === 'projects' || section === 'messages') {
        const data = await api.get('/business/projects') as { data: Row[] };
        setRows(data.data);
      } else if (section === 'contracts') {
        const data = await api.get('/business/contracts') as { data: Row[] };
        setRows(data.data);
      } else if (section === 'payments') {
        const data = await api.get('/business/payments') as { data: Row[]; note: string };
        setRows(data.data);
        setResult({ note: data.note });
      } else if (section === 'favorites') {
        const data = await api.get('/business/favorites') as { data: Row[] };
        setRows(data.data);
      } else if (section === 'reports') {
        setResult(await api.get('/business/reports') as Row);
      } else if (section === 'team') {
        const data = await api.get('/business/team') as { data: Row[] };
        setRows(data.data);
      } else if (section === 'profile') {
        const data = await api.get('/business/profile') as { profile: Row };
        setBusinessProfile(data.profile);
      }
    } catch (requestError) {
      console.error('[business] Chargement du module impossible:', requestError);
      setError(requestError instanceof Error ? requestError.message : 'Impossible de charger ce module.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessAccess, section, selectedJobId, submittedSearch, submittedProfession, submittedCity]);

  useEffect(() => {
    // Load server-owned data when the active workspace module changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSection();
  }, [loadSection]);

  const openForm = (kind: Exclude<FormKind, null>, values: Record<string, string> = {}) => {
    setFormValues({ ...EMPTY_FORM, ...values });
    setFormKind(kind);
  };

  const runMutation = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
      setFormKind(null);
      await loadSection();
    } catch (operationError) {
      console.error('[business] Action impossible:', operationError);
      Alert.alert(t('Action impossible'), operationError instanceof Error ? operationError.message : t('Réessayez plus tard.'));
    } finally {
      setBusy(false);
    }
  };

  const submitForm = () => {
    if (!formKind) return;
    const values = formValues;
    if (formKind === 'job') {
      return runMutation(async () => {
        await api.post('/business/jobs', {
          ...values,
          status: 'published',
          work_type: 'project',
          currency: 'USD',
        });
      });
    }
    if (formKind === 'payment') {
      return runMutation(async () => {
        if (!selectedProject) throw new Error('Sélectionnez un projet.');
        await api.post('/business/payments', { ...values, project_id: selectedProject.id });
      });
    }
    if (formKind === 'team') {
      return runMutation(() => api.post('/business/team/invitations', values));
    }
    if (formKind === 'profile') {
      return runMutation(async () => {
        const data = await api.patch('/business/profile', values) as { profile: Row };
        setBusinessProfile(data.profile);
      });
    }
  };

  const updateApplication = (applicationId: string, status: string) => runMutation(
    () => api.patch(`/business/applications/${applicationId}`, { status })
  );
  const updateJobStatus = (job: Row) => runMutation(
    () => api.patch(`/business/jobs/${job.id}`, { status: job.status === 'published' ? 'closed' : 'published' })
  );
  const updateProjectStatus = (project: Row, status: string) => runMutation(
    () => api.patch(`/business/projects/${project.id}`, { status })
  );
  const updatePaymentStatus = (payment: Row, status: string) => runMutation(
    () => api.patch(`/business/payments/${payment.id}`, { status })
  );
  const toggleFavorite = (artisan: Row) => runMutation(() => artisan.is_favorite
    ? api.delete(`/business/favorites/${artisan.id}`)
    : api.post(`/business/favorites/${artisan.id}`));

  const startProjectChat = async (projectId: string) => {
    const { data, error: chatError } = await supabase.rpc('start_business_project_chat', { p_project_id: projectId });
    if (chatError || !data?.id) {
      Alert.alert(t('Messages indisponibles'), chatError?.message ?? t('Cette conversation ne peut pas être ouverte.'));
      return;
    }
    router.push({ pathname: '/messages', params: { c: data.id } });
  };

  const chooseProject = (purpose: 'payment' | 'contract') => {
    void api.get('/business/projects').then((response) => {
      const projects = (response as { data: Row[] }).data;
      if (!projects.length) {
        Alert.alert(t('Aucun projet'), t('Créez ou acceptez un projet avant de continuer.'));
        return;
      }
      setRows(projects);
      setProjectPurpose(purpose);
      setProjectPickerVisible(true);
    }).catch((requestError: unknown) => {
      Alert.alert(t('Projets indisponibles'), requestError instanceof Error ? requestError.message : t('Réessayez plus tard.'));
    });
  };

  const pickContract = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!picked.canceled) {
        const asset = picked.assets[0];
        if (!/\.pdf$/i.test(asset.name)) {
          Alert.alert(t('Format invalide'), t('Sélectionnez un fichier portant l’extension PDF.'));
          return;
        }
        if (asset.size && asset.size > 20 * 1024 * 1024) {
          Alert.alert(t('Fichier trop volumineux'), t('Le PDF doit faire 20 Mo ou moins.'));
          return;
        }
        setContractFile(asset);
      }
    } catch (pickerError) {
      Alert.alert(t('Sélection du PDF impossible'), pickerError instanceof Error ? pickerError.message : t('Réessayez.'));
    }
  };

  const createContract = async () => {
    if (!selectedProject || !contractFile || !contractTitle.trim()) {
      Alert.alert(t('Informations manquantes'), t('Choisissez un projet, un PDF et un titre.'));
      return;
    }
    await runMutation(async () => {
      const response = await fetch(contractFile.uri);
      if (!response.ok) throw new Error('Impossible de lire le PDF sélectionné.');
      const file = await response.arrayBuffer();
      const baseName = contractFile.name
        .replace(/\.pdf$/i, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 120) || 'contract';
      const safeName = `${baseName}.pdf`;
      const path = `${businessAccess?.owner_id}/${selectedProject.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('business-contracts')
        .upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;
      try {
        await api.post('/business/contracts', {
          project_id: selectedProject.id,
          title: contractTitle.trim(),
          document_path: path,
          amount: contractAmount,
          currency: 'USD',
        });
      } catch (createError) {
        const { error: cleanupError } = await supabase.storage.from('business-contracts').remove([path]);
        if (cleanupError) console.error('[business] Nettoyage du PDF de contrat impossible:', cleanupError);
        throw createError;
      }
      setContractTitle('');
      setContractAmount('');
      setContractFile(null);
      setSelectedProject(null);
      setProjectPickerVisible(false);
    });
  };

  const sendContract = (contractId: string) => runMutation(
    () => api.post(`/business/contracts/${contractId}/send`)
  );

  const signContract = () => {
    if (!contractSignTarget) return;
    return runMutation(async () => {
      await api.post(`/business/contracts/${contractSignTarget.id}/sign`, {
        full_name: signatureName.trim(),
        confirmed: signatureConfirmed,
      });
      setContractSignTarget(null);
      setSignatureName('');
      setSignatureConfirmed(false);
    });
  };

  const removeMember = (memberId: string) => Alert.alert(
    t('Retirer cet employé ?'),
    t('Son accès aux projets et messages de l’entreprise sera révoqué.'),
    [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Retirer'),
        style: 'destructive',
        onPress: () => { void runMutation(() => api.delete(`/business/team/${memberId}`)); },
      },
    ]
  );

  const openDocument = (url?: string | null) => {
    if (!url) return;
    void Linking.openURL(url).catch((linkError: unknown) => {
      Alert.alert(t('Ouverture du document impossible'), linkError instanceof Error ? linkError.message : t('Réessayez.'));
    });
  };

  const moduleTitle = useMemo(
    () => t(sections.find((item) => item.id === section)?.label ?? 'Espace entreprise'),
    [sections, section, t]
  );

  if (!businessAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <Ionicons name="business-outline" size={40} color={theme.accent} />
          <Text style={[styles.heading, { color: theme.text }]}>{t('Espace entreprise indisponible')}</Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Un accès approuvé ou une invitation active est nécessaire.')}</Text>
          {profile?.role === 'artisan' && (
            <Button label="Demander une vérification" onPress={() => router.push('/business-verification')} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel={t('Retour')}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.heading, { color: theme.text }]}>{moduleTitle}</Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>
            {businessAccess.role === 'owner' ? businessProfile?.company_name ?? profile?.full_name : t('Accès employé')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/notifications')} accessibilityLabel={t('Notifications')}>
          <Ionicons name="notifications-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {sections.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.tab, { backgroundColor: section === item.id ? theme.accent : theme.backgroundElement }]}
            onPress={() => {
              setSection(item.id);
              setSelectedJobId(null);
            }}>
            <Ionicons name={item.icon} size={16} color={section === item.id ? '#fff' : theme.textSecondary} />
            <Text style={[styles.tabText, { color: section === item.id ? '#fff' : theme.text }]}>{t(item.label)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadSection(); }} />}>
        {loading && <ActivityIndicator size="large" color={theme.accent} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!loading && !error && (
          <>
            {section === 'dashboard' && (
              <>
                <Text style={[styles.subheading, { color: theme.text }]}>{t('Vue d’ensemble')}</Text>
                <View style={styles.stats}>
                  {(isOwner
                    ? [
                        ['Demandes', result.stats?.jobs ?? 0],
                        ['Candidatures', result.stats?.applications ?? 0],
                        ['Projets actifs', result.stats?.active_projects ?? 0],
                        ['Contrats à signer', result.stats?.contracts_to_sign ?? 0],
                        ['Employés', result.stats?.team_members ?? 0],
                        ['Paiements à suivre', `${result.stats?.unpaid_amount ?? 0} ${result.stats?.currency ?? 'USD'}`],
                      ]
                    : [['Projets actifs', result.stats?.active_projects ?? 0]]
                  ).map(([label, value]) => (
                    <View key={String(label)} style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
                      <Text style={[styles.statValue, { color: theme.accent }]}>{value}</Text>
                      <Text style={[styles.muted, { color: theme.textSecondary }]}>{t(String(label))}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.muted, { color: theme.textSecondary }]}>
                  {result.profile?.business_type === 'subcontractor' ? t('Profil sous-traitant vérifié') : t('Espace professionnel ARTISANTS')}
                </Text>
                <Button label="Voir les projets" onPress={() => setSection('projects')} />
                {isOwner && <Button label="Créer une demande" onPress={() => openForm('job')} />}
              </>
            )}

            {section === 'jobs' && (
              <>
                <Button label="Créer une demande" onPress={() => openForm('job')} />
                {rows.length === 0 && <Empty text="Aucune demande publiée pour le moment." />}
                {rows.map((job) => (
                  <Card key={job.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{job.title}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{job.category} · {job.city} · {job.status}</Text>
                    <Text style={[styles.body, { color: theme.text }]}>{job.description}</Text>
                    <View style={styles.actions}>
                      <SmallButton label="Candidatures" onPress={() => { setSelectedJobId(job.id); setSection('applications'); }} />
                      <SmallButton label={job.status === 'published' ? 'Clôturer' : 'Publier'} onPress={() => updateJobStatus(job)} />
                    </View>
                  </Card>
                ))}
              </>
            )}

            {section === 'applications' && (
              <>
                {selectedJobId && <SmallButton label="Toutes les candidatures" onPress={() => setSelectedJobId(null)} />}
                {rows.length === 0 && <Empty text="Aucune candidature pour cette demande." />}
                {rows.map((application) => (
                  <Card key={application.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{application.artisan?.full_name ?? t('Artisan')}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>
                      {[application.artisan?.profession, application.artisan?.city, application.status].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={[styles.body, { color: theme.text }]}>{application.message}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>
                      {application.proposed_amount ? `${application.proposed_amount} ${application.currency}` : t('Montant non précisé')}
                      {application.estimated_days ? ` · ${application.estimated_days} j` : ''}
                    </Text>
                    {application.status !== 'accepted' && application.status !== 'rejected' && (
                      <View style={styles.actions}>
                        <SmallButton label="Présélectionner" onPress={() => updateApplication(application.id, 'shortlisted')} />
                        <SmallButton label="Accepter" onPress={() => updateApplication(application.id, 'accepted')} />
                        <SmallButton label="Refuser" destructive onPress={() => updateApplication(application.id, 'rejected')} />
                      </View>
                    )}
                  </Card>
                ))}
              </>
            )}

            {section === 'artisans' && (
              <>
                <View style={styles.searchRow}>
                  <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder={t('Nom')}
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.searchInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                    returnKeyType="search"
                    onSubmitEditing={() => {
                      setSubmittedSearch(searchText.trim());
                      setSubmittedProfession(searchProfession.trim());
                      setSubmittedCity(searchCity.trim());
                    }}
                  />
                  <SmallButton label="Rechercher" onPress={() => {
                    setSubmittedSearch(searchText.trim());
                    setSubmittedProfession(searchProfession.trim());
                    setSubmittedCity(searchCity.trim());
                  }} />
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    value={searchProfession}
                    onChangeText={setSearchProfession}
                    placeholder={t('Métier')}
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.searchInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  />
                  <TextInput
                    value={searchCity}
                    onChangeText={setSearchCity}
                    placeholder={t('Ville')}
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.searchInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  />
                </View>
                {rows.length === 0 && <Empty text="Aucun artisan correspondant." />}
                {rows.map((artisan) => (
                  <Card key={artisan.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{artisan.full_name ?? t('Artisan')}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{[artisan.profession, artisan.city].filter(Boolean).join(' · ')}</Text>
                    <Text style={[styles.body, { color: theme.text }]}>{artisan.description ?? ''}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Note')}: {Number(artisan.rating ?? 0).toFixed(1)} / 5</Text>
                    <SmallButton label={artisan.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onPress={() => toggleFavorite(artisan)} />
                  </Card>
                ))}
              </>
            )}

            {(section === 'projects' || section === 'messages') && (
              <>
                {isOwner && section === 'projects' && <Button label="Créer un paiement à suivre" onPress={() => chooseProject('payment')} />}
                {rows.length === 0 && <Empty text="Aucun projet actif." />}
                {rows.map((project) => (
                  <Card key={project.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{project.title}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>
                      {project.artisan?.full_name ?? t('Artisan')} · {t(project.status)}
                    </Text>
                    {!!project.description && <Text style={[styles.body, { color: theme.text }]}>{project.description}</Text>}
                    <View style={styles.actions}>
                      <SmallButton label="Ouvrir les messages" onPress={() => startProjectChat(project.id)} />
                      {section === 'projects' && project.status !== 'completed' && (
                        <SmallButton label="Terminer le projet" onPress={() => updateProjectStatus(project, 'completed')} />
                      )}
                      {isOwner && section === 'projects' && (
                        <SmallButton label="Créer un contrat" onPress={() => {
                          setSelectedProject(project);
                          setContractFile(null);
                          setContractTitle('');
                        }} />
                      )}
                    </View>
                    {selectedProject?.id === project.id && section === 'projects' && isOwner && (
                      <View style={styles.inlineForm}>
                        <TextInput
                          value={contractTitle}
                          onChangeText={setContractTitle}
                          placeholder={t('Titre du contrat')}
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        />
                        <TextInput
                          value={contractAmount}
                          onChangeText={setContractAmount}
                          placeholder={t('Montant (facultatif)')}
                          keyboardType="numeric"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        />
                        <SmallButton label={contractFile?.name ?? 'Choisir le PDF'} onPress={() => { void pickContract(); }} />
                        <View style={styles.actions}>
                          <SmallButton label="Créer le contrat" onPress={() => { void createContract(); }} />
                          <SmallButton label="Annuler" destructive onPress={() => setSelectedProject(null)} />
                        </View>
                      </View>
                    )}
                  </Card>
                ))}
              </>
            )}

            {section === 'contracts' && (
              <>
                {selectedProject && isOwner && (
                  <Card theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Nouveau contrat')} · {selectedProject.title}</Text>
                    <TextInput
                      value={contractTitle}
                      onChangeText={setContractTitle}
                      placeholder={t('Titre du contrat')}
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    />
                    <TextInput
                      value={contractAmount}
                      onChangeText={setContractAmount}
                      placeholder={t('Montant (facultatif)')}
                      keyboardType="numeric"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    />
                    <SmallButton label={contractFile?.name ?? 'Choisir le PDF'} onPress={() => { void pickContract(); }} />
                    <View style={styles.actions}>
                      <SmallButton label="Créer le contrat" onPress={() => { void createContract(); }} />
                      <SmallButton label="Annuler" destructive onPress={() => setSelectedProject(null)} />
                    </View>
                  </Card>
                )}
                <Button label="Nouveau contrat PDF" onPress={() => chooseProject('contract')} />
                {rows.length === 0 && <Empty text="Aucun contrat enregistré." />}
                {rows.map((contract) => (
                  <Card key={contract.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{contract.title}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{contract.business_projects?.title} · {t(contract.status)}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>
                      {t('Entreprise')}: {contract.company_signed_at
                        ? `${contract.company_signed_name} · ${new Date(contract.company_signed_at).toLocaleString()}`
                        : `${t('En attente')} · ${contract.company_signer_name}`}
                    </Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>
                      {t('Artisan')}: {contract.artisan_signed_at
                        ? `${contract.artisan_signed_name} · ${new Date(contract.artisan_signed_at).toLocaleString()}`
                        : `${t('En attente')} · ${contract.artisan_signer_name}`}
                    </Text>
                    <View style={styles.actions}>
                      <SmallButton label="Ouvrir le PDF" onPress={() => openDocument(contract.document_url)} />
                      {contract.signed_document_url && <SmallButton label="Document signé" onPress={() => openDocument(contract.signed_document_url)} />}
                      {isOwner && contract.signature_provider === 'in_app' && !contract.company_signed_at && (
                        <SmallButton label="Signer le contrat" onPress={() => {
                          setSignatureName('');
                          setSignatureConfirmed(false);
                          setContractSignTarget(contract);
                        }} />
                      )}
                      {isOwner && contract.signature_provider === 'yousign' && ['draft', 'error'].includes(contract.status) && (
                        <SmallButton label="Envoyer pour signature Yousign" onPress={() => sendContract(contract.id)} />
                      )}
                    </View>
                  </Card>
                ))}
              </>
            )}

            {section === 'payments' && (
              <>
                {!!result.note && <Text style={[styles.notice, { color: theme.textSecondary, backgroundColor: theme.backgroundElement }]}>{result.note}</Text>}
                <Button label="Ajouter une échéance" onPress={() => chooseProject('payment')} />
                {rows.length === 0 && <Empty text="Aucun paiement à suivre." />}
                {rows.map((payment) => (
                  <Card key={payment.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{payment.description}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>
                      {payment.business_projects?.title} · {payment.amount} {payment.currency} · {t(payment.status)}
                    </Text>
                    {!!payment.due_date && <Text style={[styles.muted, { color: theme.textSecondary }]}>{t('Échéance')}: {payment.due_date}</Text>}
                    {isOwner && payment.status !== 'paid' && payment.status !== 'canceled' && (
                      <SmallButton label="Marquer comme payé" onPress={() => updatePaymentStatus(payment, 'paid')} />
                    )}
                  </Card>
                ))}
              </>
            )}

            {section === 'favorites' && (
              <>
                {rows.length === 0 && <Empty text="Aucun artisan dans vos favoris." />}
                {rows.map((artisan) => (
                  <Card key={artisan.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{artisan.full_name ?? t('Artisan')}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{[artisan.profession, artisan.city].filter(Boolean).join(' · ')}</Text>
                    <SmallButton label="Retirer des favoris" onPress={() => toggleFavorite({ ...artisan, is_favorite: true })} />
                  </Card>
                ))}
              </>
            )}

            {section === 'reports' && (
              <>
                {Object.entries(result).map(([group, values]) => (
                  <Card key={group} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{t(group.replace(/_/g, ' '))}</Text>
                    {Object.entries(values as Row).map(([key, value]) => (
                      <Text key={key} style={[styles.body, { color: theme.textSecondary }]}>
                        {t(key.replace(/_/g, ' '))}: {String(value)}
                      </Text>
                    ))}
                  </Card>
                ))}
              </>
            )}

            {section === 'team' && (
              <>
                <Button label="Inviter un employé" onPress={() => openForm('team')} />
                {rows.length === 0 && <Empty text="Aucun employé invité." />}
                {rows.map((member) => (
                  <Card key={member.id} theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{member.email}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{t(member.status)} · {t('Accès projets et messages uniquement')}</Text>
                    {member.status === 'active' && <SmallButton label="Révoquer l’accès" destructive onPress={() => removeMember(member.id)} />}
                  </Card>
                ))}
              </>
            )}

            {section === 'profile' && (
              <>
                {!businessProfile && <Empty text="Profil entreprise introuvable." />}
                {businessProfile && (
                  <Card theme={theme}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>{businessProfile.company_name}</Text>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>{businessProfile.company_address}</Text>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>{businessProfile.contact_email} · {businessProfile.contact_phone}</Text>
                    <Text style={[styles.muted, { color: theme.textSecondary }]}>{businessProfile.country} · {businessProfile.registration_number}</Text>
                    <Button label="Modifier le profil" onPress={() => openForm('profile', businessProfile)} />
                  </Card>
                )}
              </>
            )}

            {section === 'support' && (
              <Card theme={theme}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{t('Besoin d’aide ?')}</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>{t('Contactez l’assistance ARTISANTS pour toute question sur votre espace.')}</Text>
                <Button label="Contacter l’assistance" onPress={() => router.push('/(auth)/support-request')} />
              </Card>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!formKind} animationType="slide" transparent onRequestClose={() => setFormKind(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.subheading, { color: theme.text }]}>{t(formKind === 'job' ? 'Créer une demande' : formKind === 'team' ? 'Inviter un employé' : formKind === 'profile' ? 'Modifier le profil entreprise' : 'Ajouter une échéance')}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {formKind && FORM_FIELDS[formKind].map((field) => (
                <TextInput
                  key={field.key}
                  value={formValues[field.key] ?? ''}
                  onChangeText={(value) => setFormValues((current) => ({ ...current, [field.key]: value }))}
                  placeholder={t(field.label)}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType={field.keyboardType}
                  multiline={field.multiline}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.backgroundSelected },
                    field.multiline && styles.multiline,
                  ]}
                />
              ))}
            </ScrollView>
            <View style={styles.actions}>
              <Button label="Annuler" secondary onPress={() => setFormKind(null)} />
              <Button label={busy ? 'En cours…' : 'Enregistrer'} onPress={submitForm} disabled={busy} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={projectPickerVisible} animationType="slide" transparent onRequestClose={() => setProjectPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.subheading, { color: theme.text }]}>{t('Choisir un projet')}</Text>
            <ScrollView>
              {rows.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={[styles.choice, { borderBottomColor: theme.backgroundSelected }]}
                  onPress={() => {
                    setSelectedProject(project);
                    setProjectPickerVisible(false);
                    if (projectPurpose === 'payment') openForm('payment', { currency: 'USD' });
                    setProjectPurpose(null);
                  }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{project.title}</Text>
                  <Text style={[styles.muted, { color: theme.textSecondary }]}>{project.artisan?.full_name ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button label="Annuler" secondary onPress={() => { setProjectPickerVisible(false); setProjectPurpose(null); }} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!contractSignTarget} animationType="slide" transparent onRequestClose={() => setContractSignTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.subheading, { color: theme.text }]}>{t('Signer le contrat')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{contractSignTarget?.title}</Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>
              {t('Nom attendu')}: {contractSignTarget?.company_signer_name}
            </Text>
            <TextInput
              value={signatureName}
              onChangeText={setSignatureName}
              placeholder={t('Saisissez votre nom complet')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              maxLength={120}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <Text style={[styles.muted, { color: theme.textSecondary }]}>
              {t('Votre nom, votre compte et la date seront enregistrés. La signature n’est pas qualifiée et le PDF original ne sera pas modifié.')}
            </Text>
            <View style={styles.actions}>
              <Switch value={signatureConfirmed} onValueChange={setSignatureConfirmed} />
              <Text style={[styles.muted, { color: theme.text }]}>
                {t('J’ai lu le contrat et j’accepte son contenu.')}
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label="Annuler" secondary onPress={() => setContractSignTarget(null)} />
              <Button
                label={busy ? 'En cours…' : 'Confirmer la signature'}
                onPress={() => { void signContract(); }}
                disabled={busy || !signatureConfirmed || signatureName.trim().length < 2}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Card({ children, theme }: { children: React.ReactNode; theme: ReturnType<typeof useTheme> }) {
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>;
}

function Button({ label, onPress, secondary = false, disabled = false }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  const theme = useTheme();
  const t = useTranslate();
  return (
    <TouchableOpacity
      disabled={disabled}
      style={[styles.button, { backgroundColor: secondary ? theme.backgroundSelected : theme.accent, opacity: disabled ? 0.6 : 1 }]}
      onPress={onPress}>
      <Text style={[styles.buttonText, { color: secondary ? theme.text : '#fff' }]}>{t(label)}</Text>
    </TouchableOpacity>
  );
}

function SmallButton({ label, onPress, destructive = false }: { label: string; onPress: () => void; destructive?: boolean }) {
  const theme = useTheme();
  const t = useTranslate();
  return (
    <TouchableOpacity
      style={[styles.smallButton, { backgroundColor: destructive ? '#fef3f2' : `${theme.accent}18` }]}
      onPress={onPress}>
      <Text style={[styles.smallButtonText, { color: destructive ? '#b42318' : theme.accent }]}>{t(label)}</Text>
    </TouchableOpacity>
  );
}

function Empty({ text }: { text: string }) {
  const theme = useTheme();
  const t = useTranslate();
  return <Text style={[styles.empty, { color: theme.textSecondary }]}>{t(text)}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerCopy: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '800' },
  subheading: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  muted: { fontSize: 13, lineHeight: 19 },
  tabs: { gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  tabText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flexGrow: 1, flexBasis: '45%', borderRadius: 14, padding: 15, minHeight: 82, justifyContent: 'center', gap: 5 },
  statValue: { fontSize: 22, fontWeight: '800' },
  card: { borderRadius: 15, padding: 15, gap: 7 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20 },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  smallButton: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  smallButtonText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minHeight: 44, borderRadius: 10, paddingHorizontal: 12 },
  notice: { borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 19 },
  empty: { paddingVertical: 18, textAlign: 'center', fontSize: 14 },
  error: { borderRadius: 10, padding: 12, color: '#b42318', backgroundColor: '#fef3f2' },
  inlineForm: { gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#98a2b344', paddingTop: 10, marginTop: 6 },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 5 },
  multiline: { minHeight: 95, textAlignVertical: 'top' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' },
  modalCard: { maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10 },
  choice: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
