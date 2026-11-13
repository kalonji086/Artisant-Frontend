import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/lib/settings-context';
import { getLegalPageUrl, LEGAL_TITLES, type LegalKind } from '@/lib/legal-links';

interface Props {
  kind: LegalKind | null;
  onClose: () => void;
}

export function LegalModal({ kind, onClose }: Props) {
  const { accent, colors } = useSettings();
  const webView = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const pageUrl = useMemo(() => (kind ? getLegalPageUrl(kind) : null), [kind]);
  const pageOrigin = useMemo(() => {
    if (!pageUrl) return null;
    try {
      return new URL(pageUrl).origin;
    } catch (error) {
      console.error('[legal] adresse de la page légale invalide:', error);
      return null;
    }
  }, [pageUrl]);

  const openExternalLink = (url: string) => {
    if (!url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('mailto:')) {
      console.error('[legal] protocole de lien externe refusé.');
      return;
    }
    void Linking.openURL(url).catch((error: unknown) => {
      console.error('[legal] ouverture du lien impossible:', error);
    });
  };

  const allowNavigation = (request: WebViewNavigation) => {
    if (request.url === 'about:blank') return true;
    try {
      const target = new URL(request.url);
      if (
        target.origin === pageOrigin &&
        /^\/legal\/(privacy|terms)\/?$/.test(target.pathname)
      ) {
        return true;
      }
    } catch (error) {
      console.error('[legal] adresse de navigation invalide:', error);
      return false;
    }
    openExternalLink(request.url);
    return false;
  };

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    webView.current?.reload();
  };

  return (
    <Modal
      visible={!!kind}
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Fermer" style={styles.back} hitSlop={10}>
            <Ionicons name="arrow-back" size={23} color={accent} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
            {kind ? LEGAL_TITLES[kind] : ''}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {pageUrl && !loadError ? (
          <View style={styles.webContainer}>
            <WebView
              key={kind}
              ref={webView}
              source={{ uri: pageUrl }}
              style={styles.web}
              originWhitelist={['https://*', 'http://*', 'mailto:*', 'about:blank']}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              onShouldStartLoadWithRequest={allowNavigation}
              onOpenWindow={(event) => openExternalLink(event.nativeEvent.targetUrl)}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={(event) => {
                console.error('[legal] chargement de la page impossible:', event.nativeEvent.description);
                setLoading(false);
                setLoadError(true);
              }}
              onHttpError={(event) => {
                console.error('[legal] erreur HTTP de la page:', event.nativeEvent.statusCode);
                setLoading(false);
                setLoadError(true);
              }}
              setSupportMultipleWindows={false}
              allowsBackForwardNavigationGestures
            />
            {loading && (
              <View pointerEvents="none" style={styles.loading}>
                <ActivityIndicator size="large" color={accent} />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.error}>
            <Ionicons name="cloud-offline-outline" size={42} color={colors.muted} />
            <Text style={[styles.errorText, { color: colors.text }]}>
              {pageUrl
                ? 'Impossible de charger le document. Vérifiez votre connexion.'
                : 'L’adresse des pages légales n’est pas configurée.'}
            </Text>
            {pageUrl && (
              <TouchableOpacity style={[styles.retry, { backgroundColor: accent }]} onPress={retry}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 28 },
  webContainer: { flex: 1 },
  web: { flex: 1, backgroundColor: '#f0f4f9' },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f9',
  },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  errorText: { maxWidth: 320, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  retry: { borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '700' },
});
