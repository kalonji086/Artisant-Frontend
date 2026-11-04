import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';

const SUPPORT_NAME = 'Artisant';

type Conversation = {
  id: string;
  kind: 'direct' | 'support';
  user_a: string;
  user_b: string | null;
  last_message: string | null;
  last_message_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_is_admin: boolean;
  content: string;
  created_at: string;
};

export default function MessagesScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const params = useLocalSearchParams<{ c?: string }>();
  const [active, setActive] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    if (params.c) setActive(params.c);
  }, [params.c]);

  const loadConvs = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await supabase
      .from('chat_conversations')
      .select('id, kind, user_a, user_b, last_message, last_message_at')
      .order('last_message_at', { ascending: false });
    if (err) setError(errorMessage(err));
    const rows = (data ?? []) as Conversation[];
    setConvs(rows);
    const otherIds = Array.from(
      new Set(rows.filter((c) => c.kind === 'direct').map((c) => (c.user_a === userId ? c.user_b : c.user_a)).filter((x): x is string => !!x)),
    );
    if (otherIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', otherIds);
      setNames(Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.full_name as string) || 'Utilisateur'])));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadConvs();
    if (!userId) return;
    const ch = supabase
      .channel(`chat-convs-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => loadConvs())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadConvs, userId]);

  const loadMessages = useCallback(async (id: string) => {
    const { data, error: err } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, sender_is_admin, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500);
    if (err) setError(errorMessage(err));
    setMessages((data ?? []) as Message[]);
    void supabase.rpc('mark_chat_read', { p_conversation_id: id });
  }, []);

  useEffect(() => {
    if (!active) return;
    setMessages([]);
    loadMessages(active);
    const ch = supabase
      .channel(`chat-msgs-${active}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${active}` },
        () => loadMessages(active),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [active, loadMessages]);

  const titleOf = (c: Conversation) =>
    c.kind === 'support' ? SUPPORT_NAME : names[c.user_a === userId ? (c.user_b ?? '') : c.user_a] ?? 'Discussion';

  const openSupport = async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('start_support_chat');
    if (err || !data) return setError(errorMessage(err, 'Chat indisponible.'));
    await loadConvs();
    setActive((data as { id: string }).id);
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !active || sending) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.rpc('send_chat_message', { p_conversation_id: active, p_content: content });
    setSending(false);
    if (err) return setError(errorMessage(err));
    setText('');
    loadMessages(active);
  };

  if (active) {
    const conv = convs.find((c) => c.id === active);
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => setActive(null)} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>{conv ? titleOf(conv) : 'Discussion'}</Text>
          </View>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={styles.empty}>Aucun message. Écrivez le premier !</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_id === userId;
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {!mine && item.sender_is_admin && <Text style={styles.sender}>{SUPPORT_NAME}</Text>}
                  <Text style={mine ? styles.mineText : styles.theirText}>{item.content}</Text>
                  <Text style={[styles.time, mine && styles.timeMine]}>
                    {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Votre message"
              placeholderTextColor="#999"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && styles.disabled]} onPress={send} disabled={!text.trim() || sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const hasSupport = convs.some((c) => c.kind === 'support');
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.heading}>Messages</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={styles.flex} size="large" />
      ) : (
        <FlatList
          data={convs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.convList}
          ListHeaderComponent={
            !hasSupport ? (
              <TouchableOpacity style={styles.convRow} onPress={openSupport}>
                <View style={[styles.avatar, styles.avatarSupport]}>
                  <Ionicons name="headset" size={22} color="#fff" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.convName}>{SUPPORT_NAME}</Text>
                  <Text style={styles.convLast}>Contacter l’équipe support</Text>
                </View>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={hasSupport ? <Text style={styles.empty}>Aucune discussion.</Text> : null}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.convRow} onPress={() => setActive(item.id)}>
              <View style={[styles.avatar, item.kind === 'support' && styles.avatarSupport]}>
                <Ionicons name={item.kind === 'support' ? 'headset' : 'person'} size={22} color={item.kind === 'support' ? '#fff' : '#007AFF'} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.convName}>{titleOf(item)}</Text>
                <Text style={styles.convLast} numberOfLines={1}>
                  {item.last_message ?? 'Aucun message'}
                </Text>
              </View>
              <Text style={styles.time}>{new Date(item.last_message_at).toLocaleDateString('fr-FR')}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  heading: { fontSize: 24, fontWeight: 'bold', color: '#222', padding: 16 },
  convList: { paddingHorizontal: 16, gap: 10 },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center' },
  avatarSupport: { backgroundColor: '#FF6B00' },
  convName: { fontSize: 16, fontWeight: '600', color: '#222' },
  convLast: { fontSize: 13, color: '#666', marginTop: 2 },
  empty: { textAlign: 'center', color: '#666', marginTop: 30 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  topTitle: { fontSize: 18, fontWeight: '600', color: '#222' },
  msgList: { padding: 12, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  mineText: { color: '#fff', fontSize: 15 },
  theirText: { color: '#222', fontSize: 15 },
  sender: { fontSize: 11, fontWeight: '700', color: '#FF6B00', marginBottom: 2 },
  time: { fontSize: 11, color: '#999', marginTop: 3 },
  timeMine: { color: '#dbe9ff', alignSelf: 'flex-end' },
  error: { color: '#FF3B30', paddingHorizontal: 16, paddingVertical: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, maxHeight: 110, backgroundColor: '#f2f2f2', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, color: '#222' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
});
