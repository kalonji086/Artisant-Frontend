import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  finishTransaction,
  getAvailablePurchases as getStorePurchases,
  isUserCancelledError,
  restorePurchases as restoreStorePurchases,
  useIAP,
  type Purchase,
  type RequestSubscriptionAndroidProps,
} from 'expo-iap';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { supabase } from '@/lib/supabase-client';

type Tier = 'free' | 'pro' | 'premium' | 'enterprise';
type SubscriptionSummary = {
  tier: Tier;
  display_name: string;
  monthly_price_usd: number;
  monthly_publication_limit: number | null;
  publications_used: number;
  current_period_end: string | null;
  status: string;
  features: string[];
};

type SubscriptionPlan = {
  tier: Tier;
  display_name: string;
  monthly_price_usd: number;
  monthly_publication_limit: number | null;
  google_play_product_id: string | null;
  features: string[];
};

const PLAN_ORDER: Record<Tier, number> = {
  free: 0,
  pro: 1,
  premium: 2,
  enterprise: 3,
};

export default function SubscriptionsScreen() {
  return (
    <ErrorBoundary>
      <SubscriptionsContent />
    </ErrorBoundary>
  );
}

function SubscriptionsContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const processingTokens = useRef(new Set<string>());
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [ownedPurchases, setOwnedPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    const [result, plansResult] = await Promise.all([
      api.get('/subscriptions'),
      supabase
        .from('artisan_subscription_plans')
        .select('tier, display_name, monthly_price_usd, monthly_publication_limit, google_play_product_id, features')
        .order('monthly_price_usd', { ascending: true }),
    ]);
    if (!result?.subscription) throw new Error('Le récapitulatif de l’abonnement est indisponible.');
    if (plansResult.error) throw plansResult.error;
    setSummary(result.subscription as SubscriptionSummary);
    setPlans((plansResult.data ?? []) as SubscriptionPlan[]);
  }, []);

  const handlePurchase = useCallback(async (
    purchase: Purchase,
    shouldFinish: boolean,
    showErrors: boolean,
  ) => {
    const token = purchase.purchaseToken;
    if (!token || purchase.storeId !== 'play') {
      if (showErrors) Alert.alert('Achat invalide', 'Google Play n’a pas fourni un jeton d’achat vérifiable.');
      return false;
    }
    if (purchase.purchaseState === 'pending') {
      if (showErrors) Alert.alert('Paiement en attente', 'Google Play doit encore confirmer votre paiement.');
      return false;
    }
    if (purchase.purchaseState !== 'purchased') return false;
    if (processingTokens.current.has(token)) return false;

    processingTokens.current.add(token);
    let serverVerified = false;
    try {
      const result = await api.post('/subscriptions/verify', {
        productId: purchase.productId,
        purchaseToken: token,
      });
      if (!result?.subscription) throw new Error('Le serveur n’a pas confirmé votre abonnement.');
      setSummary(result.subscription as SubscriptionSummary);
      serverVerified = true;

      if (shouldFinish) {
        await finishTransaction({ purchase, isConsumable: false });
      }

      if (showErrors) {
        Alert.alert('Abonnement activé', 'Votre achat a été vérifié par Google Play et votre quota est à jour.');
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'La vérification de l’achat a échoué.';
      if (showErrors && serverVerified) {
        Alert.alert('Abonnement activé', `Votre paiement est confirmé, mais Google Play n’a pas pu finaliser la transaction : ${message}`);
      } else if (showErrors) Alert.alert('Vérification impossible', message);
      else console.error('[subscriptions] synchronisation Google Play impossible:', message);
      return false;
    } finally {
      processingTokens.current.delete(token);
    }
  }, []);

  const { connected, subscriptions, fetchProducts, requestPurchase, reconnect } = useIAP({
    onPurchaseSuccess: (purchase) => {
      setWorking(true);
      void handlePurchase(purchase, true, true).finally(() => setWorking(false));
    },
    onPurchaseError: (error) => {
      setWorking(false);
      if (isUserCancelledError(error)) return;
      setStoreError(error.message);
    },
    onError: (error) => {
      setStoreError(error.message);
    },
  });

  const productsById = useMemo(
    () => new Map(subscriptions.map((product) => [product.id, product])),
    [subscriptions],
  );
  const paidProductIds = useMemo(
    () => plans.flatMap((plan) =>
      plan.tier !== 'free' && plan.google_play_product_id ? [plan.google_play_product_id] : [],
    ),
    [plans],
  );

  const syncOwnedPurchases = useCallback(async (manual: boolean) => {
    if (Platform.OS !== 'android') return false;
    if (!connected) {
      const reconnected = await reconnect();
      if (!reconnected) {
        if (manual) Alert.alert('Google Play indisponible', 'Connectez-vous au Play Store puis réessayez.');
        return false;
      }
    }

    try {
      if (manual) await restoreStorePurchases();
      const purchases = await getStorePurchases();
      setOwnedPurchases(purchases);
      const currentProductIds = new Set(paidProductIds);
      const available = purchases.filter((purchase) =>
        currentProductIds.has(purchase.productId) && !!purchase.purchaseToken,
      );
      if (available.length === 0) {
        if (manual) Alert.alert('Aucun achat actif', 'Aucun abonnement ARTISANTS actif n’a été trouvé dans Google Play.');
        return false;
      }

      let verified = false;
      for (const purchase of available) {
        verified = await handlePurchase(purchase, false, false) || verified;
      }
      await refreshSummary();
      if (manual && verified) {
        Alert.alert('Abonnement restauré', 'Votre abonnement Google Play est synchronisé avec votre compte.');
      } else if (manual) {
        Alert.alert('Restauration impossible', 'Google Play a retourné un achat, mais le serveur n’a pas pu le confirmer.');
      }
      return verified;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Les achats Google Play sont indisponibles.';
      setStoreError(message);
      if (manual) Alert.alert('Restauration impossible', message);
      else console.error('[subscriptions] restauration automatique impossible:', message);
      return false;
    }
  }, [connected, handlePurchase, paidProductIds, reconnect, refreshSummary]);

  useEffect(() => {
    if (!connected || paidProductIds.length === 0) return;
    void fetchProducts({
      skus: paidProductIds,
      type: 'subs',
    }).then(() => setStoreError(null)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Les offres Google Play sont introuvables.';
      setStoreError(message);
    });
  }, [connected, fetchProducts, paidProductIds]);

  useEffect(() => {
    if (!connected || paidProductIds.length === 0 || subscriptions.length > 0) return;
    const timeout = setTimeout(() => {
      setStoreError((current) => current ?? 'Les produits ne sont pas actifs dans Google Play Console.');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [connected, paidProductIds.length, subscriptions.length]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        await refreshSummary();
        if (connected) await syncOwnedPurchases(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Les abonnements sont indisponibles.';
        setStoreError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [connected, refreshSummary, syncOwnedPurchases]));

  const buyPlan = async (tier: Exclude<Tier, 'free'>) => {
    const productId = plans.find((plan) => plan.tier === tier)?.google_play_product_id;
    if (!productId) {
      setStoreError('Cette offre ne possède pas d’identifiant Google Play configuré.');
      return;
    }
    const product = productsById.get(productId);
    if (!product) {
      setStoreError('Cette offre n’est pas encore active dans Google Play Console.');
      return;
    }

    const offer = product.subscriptionOffers?.find((item) => !!item.offerTokenAndroid);
    if (!offer?.offerTokenAndroid) {
      setStoreError('Aucune offre mensuelle active n’a été retournée par Google Play.');
      return;
    }

    setWorking(true);
    setStoreError(null);
    try {
      const account = await api.get('/subscriptions/account-id');
      if (!account?.obfuscatedAccountId) throw new Error('Le compte Google Play n’a pas pu être préparé.');

      const currentProductId = summary && summary.tier !== 'free'
        ? plans.find((plan) => plan.tier === summary.tier)?.google_play_product_id ?? ''
        : '';
      const currentPurchase = ownedPurchases.find((purchase) =>
        purchase.productId === currentProductId &&
        !!purchase.purchaseToken,
      );

      const googleRequest: RequestSubscriptionAndroidProps = {
        skus: [productId],
        obfuscatedAccountId: account.obfuscatedAccountId as string,
        subscriptionOffers: [{
          sku: productId,
          offerToken: offer.offerTokenAndroid,
        }],
      };

      if (currentPurchase?.purchaseToken && currentPurchase.productId !== productId) {
        googleRequest.purchaseToken = currentPurchase.purchaseToken;
        googleRequest.subscriptionProductReplacementParams = {
          oldProductId: currentPurchase.productId,
          replacementMode: PLAN_ORDER[tier] > PLAN_ORDER[summary?.tier ?? 'free']
            ? 'with-time-proration'
            : 'deferred',
        };
      }

      await requestPurchase({ request: { google: googleRequest }, type: 'subs' });
    } catch (error) {
      setWorking(false);
      const message = error instanceof Error ? error.message : 'L’achat Google Play n’a pas pu démarrer.';
      Alert.alert('Achat impossible', message);
    }
  };

  const openPlaySubscriptions = async () => {
    const currentProductId = summary && summary.tier !== 'free'
      ? plans.find((plan) => plan.tier === summary.tier)?.google_play_product_id
      : null;
    const url = currentProductId
      ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(currentProductId)}&package=com.artisants.app`
      : 'https://play.google.com/store/account/subscriptions';
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Ouverture impossible', error instanceof Error ? error.message : 'Google Play ne peut pas être ouvert.');
    }
  };

  if (loading && !summary) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator size="large" style={styles.center} /></SafeAreaView>;
  }

  if (profile?.role !== 'artisan') {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#007AFF" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.message}>Les abonnements sont réservés aux artisans.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          void refreshSummary().catch((error: unknown) => {
            Alert.alert('Actualisation impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
          }).finally(() => setRefreshing(false));
        }} />}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void syncOwnedPurchases(true)} disabled={working}>
            <Text style={styles.link}>Restaurer mes achats</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Abonnements artisan</Text>
        <Text style={styles.subtitle}>Choisissez votre quota de publications. Les limites sont vérifiées par le serveur.</Text>

        {summary && (
          <View style={styles.currentCard}>
            <View style={styles.currentHeader}>
              <View style={styles.currentIcon}>
                <Ionicons name="checkmark-circle" size={21} color="#16803c" />
              </View>
              <View style={styles.currentCopy}>
                <Text style={styles.currentTitle}>Offre actuelle : {summary.display_name}</Text>
                <Text style={styles.currentSubtitle}>
                  Publications : {summary.monthly_publication_limit == null
                    ? `${summary.publications_used} · illimitées`
                    : `${summary.publications_used}/${summary.monthly_publication_limit} pour la période`}
                </Text>
              </View>
            </View>
            {!!summary.current_period_end && (
              <Text style={styles.periodText}>
                Accès jusqu’au {new Date(summary.current_period_end).toLocaleDateString('fr-FR')}
                {summary.status === 'canceled' ? ' · renouvellement annulé' : ''}
              </Text>
            )}
          </View>
        )}

        {Platform.OS !== 'android' && (
          <Text style={styles.notice}>Les achats d’abonnement sont disponibles dans l’application Android via Google Play.</Text>
        )}
        {Platform.OS === 'android' && !connected && (
          <Text style={styles.notice}>Connectez-vous à Google Play. Une version native de l’application est nécessaire pour acheter un abonnement.</Text>
        )}
        {!!storeError && <Text style={styles.error}>{storeError}</Text>}

        {plans.map((plan) => {
          const current = summary?.tier === plan.tier;
          const productId = plan.google_play_product_id;
          const product = productId ? productsById.get(productId) : null;
          const price = plan.monthly_price_usd === 0
            ? 'Gratuit'
            : `${product?.displayPrice ?? `$${plan.monthly_price_usd} US$`}/mois`;
          const needsReplacement = !!summary && summary.tier !== 'free' && summary.tier !== plan.tier;
          const currentProductId = summary && summary.tier !== 'free'
            ? plans.find((item) => item.tier === summary.tier)?.google_play_product_id
            : null;
          const currentPurchase = needsReplacement && currentProductId
            ? ownedPurchases.find((purchase) => purchase.productId === currentProductId)
            : null;
          const purchaseDisabled = working || !connected || !product ||
            (needsReplacement && !currentPurchase);

          return (
            <View key={plan.tier} style={[styles.planCard, current && styles.selectedPlan]}>
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planName}>{plan.display_name}</Text>
                  <Text style={styles.planPrice}>{price}</Text>
                </View>
                {current && <Text style={styles.currentBadge}>ACTUELLE</Text>}
              </View>
              <View style={styles.features}>
                {plan.features.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle-outline" size={17} color="#16803c" />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {current ? (
                <TouchableOpacity style={styles.currentButton} disabled>
                  <Text style={styles.currentButtonText}>Offre actuelle</Text>
                </TouchableOpacity>
              ) : plan.tier === 'free' ? (
                summary?.tier !== 'free' && (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void openPlaySubscriptions()}>
                    <Text style={styles.secondaryButtonText}>Gérer dans Google Play</Text>
                  </TouchableOpacity>
                )
              ) : (
                <TouchableOpacity
                  style={[styles.buyButton, purchaseDisabled && styles.disabledButton]}
                  onPress={() => {
                    if (plan.tier !== 'free') void buyPlan(plan.tier);
                  }}
                  disabled={purchaseDisabled}>
                  {working
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buyButtonText}>
                        {needsReplacement ? 'Changer d’offre' : 'Choisir cette offre'}
                      </Text>}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <Text style={styles.footnote}>
          Les abonnements sont facturés et gérés par Google Play. Les publications déjà en ligne restent visibles si votre abonnement expire.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f9' },
  center: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backText: { color: '#007AFF', fontWeight: '600' },
  link: { color: '#007AFF', fontWeight: '600', fontSize: 13 },
  title: { color: '#17283f', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#68778a', fontSize: 14, lineHeight: 20 },
  currentCard: { backgroundColor: '#eaf7ee', borderColor: '#b8e4c4', borderWidth: 1, borderRadius: 12, padding: 14, gap: 7 },
  currentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  currentIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#d8f0df', alignItems: 'center', justifyContent: 'center' },
  currentCopy: { flex: 1 },
  currentTitle: { color: '#164b29', fontSize: 15, fontWeight: '700' },
  currentSubtitle: { color: '#37644a', fontSize: 13, marginTop: 2 },
  periodText: { color: '#52715d', fontSize: 12 },
  notice: { color: '#705b12', backgroundColor: '#fff7d6', padding: 12, borderRadius: 9, lineHeight: 18, fontSize: 13 },
  error: { color: '#9e2727', backgroundColor: '#fff0f0', padding: 12, borderRadius: 9, lineHeight: 18, fontSize: 13 },
  planCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: '#e1e6ed' },
  selectedPlan: { borderColor: '#16803c', borderWidth: 2 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { color: '#17283f', fontSize: 18, fontWeight: '700' },
  planPrice: { color: '#007AFF', fontSize: 21, fontWeight: '700', marginTop: 3 },
  currentBadge: { color: '#16803c', backgroundColor: '#e5f5e9', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { color: '#455468', fontSize: 14 },
  buyButton: { minHeight: 44, backgroundColor: '#007AFF', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  disabledButton: { opacity: 0.45 },
  buyButtonText: { color: '#fff', fontWeight: '700' },
  currentButton: { minHeight: 42, borderRadius: 10, backgroundColor: '#e7f2eb', alignItems: 'center', justifyContent: 'center' },
  currentButtonText: { color: '#16803c', fontWeight: '700' },
  secondaryButton: { minHeight: 42, borderWidth: 1, borderColor: '#c9dcf5', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#007AFF', fontWeight: '600' },
  footnote: { color: '#7a8695', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8, paddingTop: 4 },
  message: { color: '#68778a', textAlign: 'center', padding: 28 },
});
