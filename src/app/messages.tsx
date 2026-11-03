import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { supabase } from '@/lib/supabase-client';
import api from '@/lib/api';

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
};

type Conversation = {
  id: string;
  other_user_id: string;
  other_user_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
};

export default function MessagesScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (err: unknown) {
      console.error('Erreur conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      setActiveConversationId(conversationId);
    } catch (err: unknown) {
      console.error('Erreur messages:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversationId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConversationId,
          sender_id: user?.id,
          content: newMessage.trim(),
        });

      if (error) throw error;

      setNewMessage('');
      fetchMessages(activeConversationId);
    } catch (err: unknown) {
      console.error('Erreur envoi:', err);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <Text style={styles.sectionTitle}>Messages</Text>
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.conversationItem, activeConversationId === item.id && styles.conversationActive]}
              onPress={() => fetchMessages(item.id)}
            >
              <Text style={styles.conversationName}>{item.other_user_name}</Text>
              <Text style={styles.conversationPreview}>{item.last_message}</Text>
              {item.unread_count > 0 && (
                <Text style={styles.unreadBadge}>{item.unread_count}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      </View>

      {activeConversationId ? (
        <View style={styles.chatArea}>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.messageBubble, item.sender_id === (supabase.auth.getUser() as any).data.user?.id && styles.messageOwn]}>
                <Text style={styles.messageText}>{item.content}</Text>
              </View>
            )}
            contentContainerStyle={styles.messagesContent}
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              placeholder="Écrire un message..."
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
              <Text style={styles.sendButtonText}>Envoyer</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Sélectionnez une conversation</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  sidebar: {
    width: '40%',
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  chatArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: 16,
    color: '#333',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  conversationActive: {
    backgroundColor: '#E3F2FD',
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  conversationPreview: {
    fontSize: 14,
    color: '#666',
  },
  unreadBadge: {
    marginLeft: 'auto',
    backgroundColor: '#007AFF',
    color: 'white',
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageOwn: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  messageText: {
    color: '#333',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 8,
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});