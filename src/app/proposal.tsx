import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { INPUT_PROPS } from '@/lib/input-colors';
import { themedStyles } from '@/lib/themed-styles';
import { useSettings } from '@/lib/settings-context';

type Line = { description: string; quantity: string; unitPrice: string };
type ProposalResponse = {
  proposal_intro: string | null;
  proposal_items: { description: string; quantity: number; unitPrice: number }[] | null;
  proposal_currency: string | null;
  proposal_tax_rate: number | null;
  proposal_valid_until: string | null;
  proposal_terms: string | null;
  proposal_sent_at: string | null;
  status: string;
};

const emptyLine = (): Line => ({ description: '', quantity: '1', unitPrice: '' });

export default function QuoteProposalScreen() {
  const { accent } = useSettings();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proposalSent, setProposalSent] = useState(false);
  const [intro, setIntro] = useState('');
  const [items, setItems] = useState<Line[]>([emptyLine()]);
  const [currency, setCurrency] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [terms, setTerms] = useState('');
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [currencySearch, setCurrencySearch] = useState('');
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      Alert.alert('Devis introuvable', 'Identifiant de devis manquant.');
      router.back();
      return;
    }
    try {
      const [proposal, availableCurrencies] = await Promise.all([
        api.get(`/quotes/${encodeURIComponent(id)}/proposal`) as Promise<ProposalResponse>,
        api.get('/quotes/currencies') as Promise<string[]>,
      ]);
      setCurrencies(availableCurrencies);
      setProposalSent(!!proposal.proposal_sent_at || proposal.status === 'quote_sent');
      setIntro(proposal.proposal_intro ?? '');
      setItems(proposal.proposal_items?.length
        ? proposal.proposal_items.map((item) => ({
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
          }))
        : [emptyLine()]);
      setCurrency(proposal.proposal_currency ?? '');
      setTaxRate(String(proposal.proposal_tax_rate ?? 0));
      setValidUntil(proposal.proposal_valid_until ?? '');
      setTerms(proposal.proposal_terms ?? '');
    } catch (error) {
      Alert.alert('Chargement impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    // Load quote data from the API when this screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const calculated = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const quantity = Number(item.quantity.replace(',', '.'));
      const price = Number(item.unitPrice.replace(',', '.'));
      return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
    }, 0);
    const tax = subtotal * (Number(taxRate.replace(',', '.')) || 0) / 100;
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxRate]);
  const currencyDigits = currency
    ? new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
    : 2;
  const formatAmount = (amount: number) => amount.toLocaleString('fr-FR', {
    minimumFractionDigits: currencyDigits,
    maximumFractionDigits: currencyDigits,
  });

  const save = async () => {
    if (!id) return;
    if (!currency) {
      Alert.alert('Devise requise', 'Choisissez une devise avant d’enregistrer le devis.');
      return;
    }
    const parsedItems = items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity.replace(',', '.')),
      unitPrice: Number(item.unitPrice.replace(',', '.')),
    }));
    if (parsedItems.some((item) => !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      Alert.alert('Ligne invalide', 'Chaque ligne doit avoir une désignation, une quantité positive et un prix valide.');
      return;
    }
    const parsedTax = Number(taxRate.replace(',', '.'));
    if (!Number.isFinite(parsedTax) || parsedTax < 0 || parsedTax > 100) {
      Alert.alert('TVA invalide', 'Le taux de TVA doit être compris entre 0 et 100 %.');
      return;
    }
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      Alert.alert('Date invalide', 'Utilisez le format AAAA-MM-JJ ou laissez la date vide.');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/quotes/${encodeURIComponent(id)}/proposal`, {
        intro,
        items: parsedItems,
        currency,
        taxRate: parsedTax,
        validUntil: validUntil || null,
        terms,
      });
      return true;
    } catch (error) {
      Alert.alert('Enregistrement impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!id) return;
    Alert.alert('Envoyer le devis par email ?', 'Le client recevra le devis en PDF. Une notification sera créée après confirmation de l’envoi.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Envoyer',
        onPress: () => {
          void (async () => {
            if (!(await save())) return;
            setSaving(true);
            try {
              await api.post(`/quotes/${encodeURIComponent(id)}/proposal/send`);
              setProposalSent(true);
              Alert.alert('Devis envoyé', 'Le devis PDF a été envoyé au client par email.');
              router.back();
            } catch (error) {
              Alert.alert('Envoi impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const filteredCurrencies = currencies.filter((code) => code.toLowerCase().includes(currencySearch.trim().toLowerCase())).slice(0, 40);

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator size="large" color={accent} style={styles.loading} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={[styles.back, { color: accent }]}>‹ Retour</Text></TouchableOpacity>
          <Text style={styles.title}>Devis professionnel</Text>
          <Text style={styles.subtitle}>Le devis sera envoyé au client en pièce jointe PDF.</Text>
        </View>
        {proposalSent ? (
          <View style={styles.notice}><Text style={styles.noticeText}>Ce devis a déjà été envoyé au client par email.</Text></View>
        ) : (
          <>
            <Text style={styles.label}>Introduction</Text>
            <TextInput {...INPUT_PROPS} style={styles.input} value={intro} onChangeText={setIntro} placeholder="Message d’accompagnement (optionnel)" multiline />

            <Text style={styles.section}>Prestations et coûts</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.lineCard}>
                <View style={styles.lineHeader}>
                  <Text style={styles.label}>Ligne {index + 1}</Text>
                  {items.length > 1 && <TouchableOpacity onPress={() => setItems((current) => current.filter((_, i) => i !== index))}><Text style={styles.remove}>Supprimer</Text></TouchableOpacity>}
                </View>
                <TextInput {...INPUT_PROPS} style={styles.input} value={item.description} onChangeText={(value) => setItems((current) => current.map((line, i) => i === index ? { ...line, description: value } : line))} placeholder="Désignation" />
                <View style={styles.row}>
                  <TextInput {...INPUT_PROPS} style={[styles.input, styles.numberInput]} value={item.quantity} onChangeText={(value) => setItems((current) => current.map((line, i) => i === index ? { ...line, quantity: value } : line))} placeholder="Quantité" keyboardType="decimal-pad" />
                  <TextInput {...INPUT_PROPS} style={[styles.input, styles.numberInput]} value={item.unitPrice} onChangeText={(value) => setItems((current) => current.map((line, i) => i === index ? { ...line, unitPrice: value } : line))} placeholder={`Prix (${currency})`} keyboardType="decimal-pad" />
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.addButton} onPress={() => setItems((current) => [...current, emptyLine()])}>
              <Text style={[styles.addText, { color: accent }]}>+ Ajouter une ligne</Text>
            </TouchableOpacity>

            <Text style={styles.section}>Devise et TVA</Text>
            <TouchableOpacity style={styles.currencyButton} onPress={() => setCurrencyPickerOpen(true)}>
              <Text style={styles.currencyLabel}>Devise</Text>
              <Text style={styles.currencyValue}>{currency || 'Choisir une devise'}  ›</Text>
            </TouchableOpacity>
            <Text style={styles.label}>Taux de TVA ajouté au sous-total (%)</Text>
            <TextInput {...INPUT_PROPS} style={styles.input} value={taxRate} onChangeText={setTaxRate} placeholder="0" keyboardType="decimal-pad" />

            <View style={styles.summary}>
              <Text style={styles.summaryLine}>Sous-total : {formatAmount(calculated.subtotal)} {currency}</Text>
              <Text style={styles.summaryLine}>TVA : {formatAmount(calculated.tax)} {currency}</Text>
              <Text style={styles.total}>Total TTC : {formatAmount(calculated.total)} {currency}</Text>
            </View>

            <Text style={styles.section}>Validité et conditions</Text>
            <TextInput {...INPUT_PROPS} style={styles.input} value={validUntil} onChangeText={setValidUntil} placeholder="Date de validité (AAAA-MM-JJ)" />
            <TextInput {...INPUT_PROPS} style={[styles.input, styles.multiline]} value={terms} onChangeText={setTerms} placeholder="Conditions et modalités" multiline />

            <TouchableOpacity disabled={saving} style={[styles.primaryButton, { backgroundColor: accent, opacity: saving ? 0.6 : 1 }]} onPress={() => void save().then((saved) => saved && Alert.alert('Enregistré', 'Votre brouillon a été enregistré.'))}>
              <Text style={styles.primaryText}>{saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={saving || items.length === 0} style={[styles.sendButton, { opacity: saving ? 0.6 : 1 }]} onPress={send}>
              <Text style={styles.primaryText}>{saving ? 'Veuillez patienter…' : 'Envoyer le PDF au client'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={currencyPickerOpen} animationType="slide" onRequestClose={() => setCurrencyPickerOpen(false)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.pickerHeader}>
            <Text style={styles.section}>Choisir une devise</Text>
            <Pressable onPress={() => setCurrencyPickerOpen(false)}><Text style={[styles.back, { color: accent }]}>Fermer</Text></Pressable>
          </View>
          <TextInput {...INPUT_PROPS} style={styles.input} value={currencySearch} onChangeText={setCurrencySearch} placeholder="Rechercher un code ISO (ex. EUR)" autoCapitalize="characters" />
          <FlatList
            data={filteredCurrencies}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.currencyRow} onPress={() => { setCurrency(item); setCurrencyPickerOpen(false); setCurrencySearch(''); }}>
                <Text style={styles.currencyValue}>{item}</Text>
                <Text style={styles.muted}>{item === currency ? 'Sélectionnée' : ''}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 18, gap: 12 },
  loading: { flex: 1 },
  header: { gap: 8, marginBottom: 8 },
  back: { fontSize: 16, fontWeight: '700' },
  title: { fontSize: 25, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 14, color: '#666' },
  section: { fontSize: 18, fontWeight: '700', color: '#222', marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#444' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 11, fontSize: 15, color: '#222', backgroundColor: '#fff' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  lineCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 9 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remove: { color: '#d33', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  numberInput: { flex: 1 },
  addButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  addText: { fontWeight: '700', fontSize: 15 },
  currencyButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 13 },
  currencyLabel: { color: '#444', fontWeight: '600' },
  currencyValue: { color: '#222', fontWeight: '700' },
  summary: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6 },
  summaryLine: { color: '#555', fontSize: 14 },
  total: { color: '#222', fontSize: 17, fontWeight: '700', marginTop: 4 },
  primaryButton: { marginTop: 8, borderRadius: 10, padding: 14, alignItems: 'center' },
  sendButton: { borderRadius: 10, backgroundColor: '#34a853', padding: 14, alignItems: 'center', marginBottom: 20 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  notice: { backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16 },
  noticeText: { color: '#26713c', fontWeight: '600' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  currencyRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: '#888', fontSize: 13 },
});
