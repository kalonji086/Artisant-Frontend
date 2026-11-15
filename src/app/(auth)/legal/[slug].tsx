import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LEGAL_URLS } from '@/lib/legal-links';

type LegalSlug = keyof typeof LEGAL_URLS;

export default function LegalDocumentScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const validSlug = slug === 'privacy' || slug === 'terms' ? (slug as LegalSlug) : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={23} color="#17202e" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {validSlug === 'privacy' ? 'Politique de confidentialité' : 'Conditions d’utilisation'}
        </Text>
      </View>
      {validSlug ? (
        <>
          {loading && !error ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>Impossible de charger ce document. Vérifiez votre connexion.</Text>
              <TouchableOpacity
                style={styles.retry}
                onPress={() => {
                  setError(false);
                  setLoading(true);
                }}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              key={validSlug}
              source={{ uri: LEGAL_URLS[validSlug] }}
              style={[styles.webview, loading && styles.hidden]}
              cacheEnabled={false}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              onHttpError={(event) => {
                if (event.nativeEvent.statusCode >= 400) {
                  setLoading(false);
                  setError(true);
                }
              }}
            />
          )}
        </>
      ) : (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Document légal introuvable.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#eaecf0' },
  title: { flex: 1, color: '#101828', fontSize: 17, fontWeight: '800' },
  webview: { flex: 1, backgroundColor: '#fff' },
  hidden: { opacity: 0 },
  loading: { ...StyleSheet.absoluteFill, top: 56, zIndex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  errorText: { color: '#475467', fontSize: 15, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: '#1877F2' },
  retryText: { color: '#fff', fontWeight: '700' },
});
