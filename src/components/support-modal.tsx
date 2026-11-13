import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { INPUT_PROPS } from '@/lib/input-colors';

type RequestType = 'help' | 'account_deletion';

const SUBJECTS = ['Inscription', 'Connexion', 'Mon compte', 'Paiement / devis', 'Autre'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHEET_MAX_WIDTH = 600;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SupportModal({ visible, onClose }: Props) {
  useSettings();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const fs = responsive.fs;

  const [type, setType] = useState<RequestType>('help');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<string, number>>({});

  const isDelete = type === 'account_deletion';
  const trimmedMessage = message.trim();

  const reset = () => {
    setEmail('');
    setFullName('');
    setSubject('');
    setMessage('');
    setConfirmDelete(false);
  };

  const submitBlocked =
    loading ||
    !EMAIL_RE.test(email.trim()) ||
    (isDelete ? !confirmDelete : trimmedMessage.length < 10);

  const submit = async () => {
    if (submitBlocked) return;
    setLoading(true);
    try {
      await api.post('/support-requests', {
        request_type: type,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim() || null,
        subject: isDelete ? 'Suppression de compte' : subject || null,
        message: isDelete ? trimmedMessage || 'Demande de suppression de compte.' : trimmedMessage,
      });
      reset();
      Alert.alert(
        'Demande envoyée',
        isDelete
          ? 'Votre demande de suppression a bien été enregistrée. Notre équipe vous contactera à cette adresse avant de supprimer définitivement votre compte.'
          : 'Merci, notre équipe vous répondra par email dans les meilleurs délais.',
        [{ text: 'OK', onPress: onClose }],
      );
    } catch {
      Alert.alert('Envoi impossible', 'Votre demande n\'a pas pu être envoyée. Vérifiez votre connexion et réessayez.');
    } finally {
      setLoading(false);
    }
  };

  // Les champs sont des enfants directs du contenu : leur y est relatif au ScrollView.
  const track = (key: string) => (e: LayoutChangeEvent) => {
    fieldY.current[key] = e.nativeEvent.layout.y;
  };
  const scrollTo = (key: string) => () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (fieldY.current[key] ?? 0) - 12), animated: true });
    }, 300);
  };

  const input = (key: string, props: TextInputProps, extra?: object) => (
    <View onLayout={track(key)}>
      <TextInput
        {...INPUT_PROPS}
        {...props}
        onFocus={scrollTo(key)}
        style={[styles.input, { fontSize: fs(15) }, extra]}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}>
      <KeyboardAvoidingView
        style={[styles.backdrop, responsive.isTablet && styles.backdropTablet]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View
          style={[
            styles.sheet,
            responsive.isTablet && styles.sheetTablet,
            { maxHeight: windowHeight - insets.top - 8 },
          ]}>
          <View style={[styles.header, { paddingHorizontal: responsive.gutter }]}>
            <Text style={[styles.title, { fontSize: fs(18) }]} numberOfLines={2}>
              {isDelete ? 'Supprimer mon compte' : 'Aide'}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Fermer" style={styles.close} hitSlop={10}>
              <Ionicons name="close" size={26} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { padding: responsive.gutter, paddingBottom: insets.bottom + 32 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets>
            <View style={styles.segmented}>
              {(
                [
                  { value: 'help', label: 'Demander de l\'aide' },
                  { value: 'account_deletion', label: 'Suppression de compte' },
                ] as { value: RequestType; label: string }[]
              ).map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.segment, type === o.value && styles.segmentActive]}
                  onPress={() => setType(o.value)}>
                  <Text style={[styles.segmentText, { fontSize: fs(13) }, type === o.value && styles.segmentTextActive]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isDelete && (
              <Text style={[styles.info, { fontSize: fs(13), lineHeight: fs(19) }]}>
                La suppression est définitive : vos données de profil, devis et messages seront effacés. Un récapitulatif de la demande est conservé pour nos obligations légales.
              </Text>
            )}

            <Text style={[styles.label, { fontSize: fs(14) }]}>Adresse email du compte *</Text>
            {input('email', {
              value: email,
              onChangeText: setEmail,
              placeholder: 'vous@exemple.com',
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              autoCorrect: false,
            })}

            <Text style={[styles.label, { fontSize: fs(14) }]}>Nom complet</Text>
            {input('name', { value: fullName, onChangeText: setFullName, placeholder: 'Facultatif' })}

            {!isDelete && (
              <>
                <Text style={[styles.label, { fontSize: fs(14) }]}>Sujet</Text>
                <View style={styles.chips}>
                  {SUBJECTS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, subject === s && styles.chipActive]}
                      onPress={() => setSubject(subject === s ? '' : s)}>
                      <Text style={[styles.chipText, { fontSize: fs(13) }, subject === s && styles.chipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.label, { fontSize: fs(14) }]}>{isDelete ? 'Raison (facultatif)' : 'Votre message *'}</Text>
            {input(
              'message',
              {
                value: message,
                onChangeText: setMessage,
                placeholder: isDelete
                  ? 'Dites-nous pourquoi vous quittez ARTISANTS'
                  : 'Décrivez votre problème (10 caractères minimum)',
                multiline: true,
                maxLength: 2000,
              },
              styles.textarea,
            )}

            {isDelete && (
              <TouchableOpacity style={styles.checkRow} onPress={() => setConfirmDelete((v) => !v)}>
                <Ionicons
                  name={confirmDelete ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={confirmDelete ? '#e53935' : '#777'}
                />
                <Text style={[styles.checkText, { fontSize: fs(14), lineHeight: fs(20) }]}>
                  Je comprends que la suppression de mon compte est définitive.
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submit, isDelete && styles.submitDanger, submitBlocked && styles.submitDisabled]}
              onPress={submit}
              disabled={submitBlocked}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitText, { fontSize: fs(16) }]}>
                  {isDelete ? 'Envoyer la demande de suppression' : 'Envoyer ma demande'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdropTablet: { justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: '100%',
    flexShrink: 1,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  sheetTablet: { maxWidth: SHEET_MAX_WIDTH, borderRadius: 18 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { flex: 1, fontWeight: 'bold', color: '#222' },
  close: { padding: 4 },
  scroll: { flexShrink: 1 },
  content: { gap: 12 },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#e8e8e8', borderRadius: 10, padding: 4, gap: 4 },
  segment: { flexGrow: 1, flexBasis: 140, minHeight: 44, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: '#666', fontWeight: '600', textAlign: 'center' },
  segmentTextActive: { color: '#222' },
  info: { color: '#555' },
  label: { fontWeight: '600', color: '#444' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    color: '#222',
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  chipActive: { borderColor: '#1976d2', backgroundColor: '#e3f2fd' },
  chipText: { color: '#555' },
  chipTextActive: { color: '#1976d2', fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkText: { flex: 1, color: '#333' },
  submit: { backgroundColor: '#1976d2', borderRadius: 10, minHeight: 50, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  submitDanger: { backgroundColor: '#e53935' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
});
