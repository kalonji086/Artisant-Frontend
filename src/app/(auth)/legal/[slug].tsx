import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { LEGAL_URLS } from '@/lib/legal-links';
import { supabase } from '@/lib/supabase-client';

type LegalSlug = keyof typeof LEGAL_URLS;

export default function LegalDocumentScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const validSlug = slug === 'privacy' || slug === 'terms' ? (slug as LegalSlug) : null;
  const webView = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!validSlug) return;
    const channel = supabase
      .channel('legal-document-updates', { config: { private: true } })
      .on('broadcast', { event: 'document_changed' }, ({ payload }) => {
        if (payload?.slug !== 'privacy' && payload?.slug !== 'terms') return;
        setError(false);
        webView.current?.reload();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          webView.current?.reload();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[legal] Actualisation temps réel indisponible:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [validSlug]);

  return (
    <SafeAreaView style={styles.safe}>
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
                  webView.current?.reload();
                }}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.backText}>Retour</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              ref={webView}
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
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1, backgroundColor: '#fff' },
  hidden: { opacity: 0 },
  loading: { ...StyleSheet.absoluteFill, zIndex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  errorText: { color: '#475467', fontSize: 15, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: '#1877F2' },
  retryText: { color: '#fff', fontWeight: '700' },
  backText: { color: '#1877F2', fontSize: 14, fontWeight: '600' },
});
