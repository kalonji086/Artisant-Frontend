import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGAL_URLS } from '@/lib/legal-links';
import { getOfflineLegalHtml } from '@/lib/legal-offline';
import { supabase } from '@/lib/supabase-client';

type LegalSlug = keyof typeof LEGAL_URLS;

export default function LegalDocumentScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const validSlug = slug === 'privacy' || slug === 'terms' ? (slug as LegalSlug) : null;
  const [loading, setLoading] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState<'cached' | 'bundled' | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const title = validSlug === 'privacy'
    ? 'Politique de confidentialité'
    : validSlug === 'terms'
      ? 'Conditions d’utilisation'
      : 'Document légal';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  useEffect(() => {
    if (!validSlug) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const cacheKey = `@artisant/legal-document/${validSlug}`;

    const loadDocument = async () => {
      setLoading(true);
      try {
        const response = await fetch(LEGAL_URLS[validSlug], {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        if (!content.trim() || !/<html[\s>]/i.test(content)) {
          throw new Error('Le serveur a renvoyé un document légal invalide.');
        }

        try {
          await AsyncStorage.setItem(cacheKey, content);
        } catch (cacheError) {
          console.warn('[legal] Mise en cache du document impossible:', cacheError);
        }
        if (active) {
          setHtml(content);
          setOfflineCopy(null);
        }
      } catch (loadError) {
        if (!active) return;
        console.warn('[legal] Chargement distant impossible, utilisation de la copie hors ligne:', loadError);
        let cached: string | null = null;
        try {
          cached = await AsyncStorage.getItem(cacheKey);
        } catch (cacheError) {
          console.warn('[legal] Lecture de la copie en cache impossible:', cacheError);
        }
        if (active) {
          setHtml(cached || getOfflineLegalHtml(validSlug));
          setOfflineCopy(cached ? 'cached' : 'bundled');
        }
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    };

    void loadDocument();

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [validSlug, refreshVersion]);

  useEffect(() => {
    if (!validSlug) return;
    const channel = supabase
      .channel('legal-document-updates', { config: { private: true } })
      .on('broadcast', { event: 'document_changed' }, ({ payload }) => {
        if (payload?.slug !== 'privacy' && payload?.slug !== 'terms') return;
        setRefreshVersion((version) => version + 1);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[legal] Actualisation temps réel indisponible:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [validSlug]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={24} color="#101828" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.content}>
        {validSlug && html ? (
          <>
            {offlineCopy ? (
              <View style={styles.offlineNotice}>
                <Text style={styles.offlineText}>
                  {offlineCopy === 'cached'
                    ? 'Hors ligne : dernière version enregistrée.'
                    : 'Hors ligne : copie intégrée à l’application.'}
                </Text>
                <TouchableOpacity
                  onPress={() => setRefreshVersion((version) => version + 1)}
                  accessibilityRole="button">
                  <Text style={styles.retryText}>Actualiser</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <WebView
              key={`${validSlug}-${refreshVersion}`}
              source={{
                html,
                baseUrl: LEGAL_URLS[validSlug].replace(/\/legal\/(?:privacy|terms)$/, '/'),
              }}
              style={styles.webview}
              cacheEnabled
              onLoadStart={() => setWebViewLoading(true)}
              onLoadEnd={() => setWebViewLoading(false)}
            />
            {loading || webViewLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#1877F2" />
              </View>
            ) : null}
          </>
        ) : !validSlug ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>Document légal introuvable.</Text>
          </View>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1877F2" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E7EC',
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, marginLeft: 8, color: '#101828', fontSize: 16, fontWeight: '600' },
  content: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#fff' },
  loading: { ...StyleSheet.absoluteFill, zIndex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  errorText: { color: '#475467', fontSize: 15, textAlign: 'center' },
  offlineNotice: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, backgroundColor: '#fff7e6', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0d7a2' },
  offlineText: { flex: 1, color: '#8a5a00', fontSize: 12 },
  retryText: { color: '#1877F2', fontWeight: '700', fontSize: 12 },
});
