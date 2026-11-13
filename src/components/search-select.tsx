import { useSettings } from '@/lib/settings-context';
import { themedStyles } from '@/lib/themed-styles';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { INPUT_PROPS } from '@/lib/input-colors';

export type SelectOption = { value: string; label: string; keywords?: string };

type Props = {
  label: string;
  placeholder: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Permet de valider la saisie libre si elle ne figure pas dans la liste (ex. ville). */
  allowCustom?: boolean;
  disabled?: boolean;
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Liste déroulante avec filtrage en temps réel à chaque lettre saisie. */
export function SearchSelect({ label, placeholder, value, options, onChange, allowCustom, disabled }: Props) {
  useSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(`${o.label} ${o.keywords ?? ''}`).includes(q));
  }, [options, query]);

  const trimmed = query.trim();
  const exact = options.some((o) => normalize(o.label) === normalize(trimmed));
  const showCustom = !!allowCustom && trimmed.length > 0 && !exact;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (v: string) => {
    onChange(v);
    close();
  };

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? selectedLabel : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{label}</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Fermer">
              <Ionicons name="close" size={24} color="#222" />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#666" />
            <TextInput
              {...INPUT_PROPS}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher…"
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              showCustom ? (
                <TouchableOpacity style={styles.row} onPress={() => pick(trimmed)}>
                  <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                  <Text style={styles.customText}>Utiliser « {trimmed} »</Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              showCustom ? null : <Text style={styles.empty}>Aucun résultat</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => pick(item.value)}>
                <Text style={[styles.rowText, item.value === value && styles.rowTextActive]}>{item.label}</Text>
                {item.value === value && <Ionicons name="checkmark" size={20} color="#007AFF" />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = themedStyles({
  trigger: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerDisabled: { opacity: 0.5 },
  triggerText: { flex: 1, fontSize: 16, color: '#222' },
  placeholder: { color: '#999' },
  modal: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#222' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    backgroundColor: '#fff',
  },
  rowText: { flex: 1, fontSize: 16, color: '#222' },
  rowTextActive: { color: '#007AFF', fontWeight: '600' },
  customText: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
});
