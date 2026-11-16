import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { useTranslate } from '@/lib/user-preferences-context';

const HELP_ITEMS = [
  {
    icon: 'person-circle-outline',
    title: 'Créer ou modifier mon compte',
    description: 'Inscrivez-vous avec une adresse e-mail valide. Depuis Paramètres, vous pouvez modifier vos informations de profil.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'J’ai oublié mon mot de passe',
    description: 'Demandez un code de vérification par e-mail, puis saisissez-le dans l’application pour choisir un nouveau mot de passe.',
    route: 'password',
  },
  {
    icon: 'map-outline',
    title: 'La carte ne trouve pas ma position',
    description: 'Activez le GPS et autorisez Artisants à accéder à votre position pendant l’utilisation. Vous pouvez gérer le partage depuis les réglages de la carte.',
  },
  {
    icon: 'document-text-outline',
    title: 'Comment suivre une demande de devis ?',
    description: 'Ouvrez Mes devis pour consulter son statut, retrouver l’artisan attribué et discuter avec lui.',
  },
  {
    icon: 'notifications-outline',
    title: 'Je ne reçois pas les notifications',
    description: 'Vérifiez les autorisations de notifications du téléphone et les préférences dans Paramètres.',
  },
  {
    icon: 'location-outline',
    title: 'Qui peut voir ma position ?',
    description: 'Le partage est facultatif. Pour un client, seule la personne attribuée à la demande peut voir la position partagée pour cette demande.',
  },
] as const;

export default function HelpCenterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslate();
  const [expanded, setExpanded] = useState<number | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('Retour')}>
          <Ionicons name="arrow-back" size={23} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('Centre d’aide')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: theme.accent }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="help-buoy-outline" size={26} color={theme.accent} />
            </View>
            <Text style={styles.eyebrow}>{t('NOUS SOMMES LÀ POUR VOUS')}</Text>
          </View>
          <Text style={styles.title}>{t('Comment pouvons-nous vous aider ?')}</Text>
          <Text style={styles.subtitle}>{t('Consultez les réponses ou écrivez directement à notre équipe.')}</Text>
          <TouchableOpacity
            style={styles.supportButton}
            onPress={() => router.push('/(auth)/support-request')}
            accessibilityRole="button">
            <Ionicons name="chatbubbles-outline" size={19} color={theme.accent} />
            <Text style={[styles.supportButtonText, { color: theme.accent }]}>
              {t('Écrire au support')}
            </Text>
            <Ionicons name="arrow-forward" size={17} color={theme.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('Questions fréquentes')}</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>{t('Touchez une question pour afficher la réponse.')}</Text>
          </View>
          <Ionicons name="sparkles-outline" size={21} color={theme.accent} />
        </View>

        <View style={[styles.faqList, { borderColor: theme.backgroundSelected }]}>
          {HELP_ITEMS.map((item, index) => {
            const isExpanded = expanded === index;
            return (
              <View key={item.title} style={[styles.faqItem, { borderBottomColor: theme.backgroundSelected }]}>
                <TouchableOpacity
                  style={styles.question}
                  onPress={() => setExpanded(isExpanded ? null : index)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}>
                  <View style={[styles.questionIcon, { backgroundColor: `${theme.accent}16` }]}>
                    <Ionicons name={item.icon} size={19} color={theme.accent} />
                  </View>
                  <Text style={[styles.questionText, { color: theme.text }]}>{t(item.title)}</Text>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
                </TouchableOpacity>
                {isExpanded ? (
                  <View style={styles.answerWrap}>
                    <Text style={[styles.answer, { color: theme.textSecondary }]}>{t(item.description)}</Text>
                    {'route' in item && item.route === 'password' ? (
                      <TouchableOpacity
                        style={styles.inlineLink}
                        onPress={() => router.push('/(auth)/forgot-password')}
                        accessibilityRole="button">
                        <Text style={[styles.inlineLinkText, { color: theme.accent }]}>{t('Réinitialiser mon mot de passe')}</Text>
                        <Ionicons name="arrow-forward" size={15} color={theme.accent} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={[styles.accountCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.accountIcon, { backgroundColor: '#b4231814' }]}>
            <Ionicons name="person-remove-outline" size={21} color="#b42318" />
          </View>
          <View style={styles.accountCopy}>
            <Text style={[styles.accountTitle, { color: theme.text }]}>{t('Gérer mon compte')}</Text>
            <Text style={[styles.accountDescription, { color: theme.textSecondary }]}>
              {t('Vous pouvez envoyer une demande de suppression sécurisée avec les informations nécessaires.')}
            </Text>
            <TouchableOpacity
              style={styles.inlineLink}
              onPress={() => router.push('/account-deletion')}
              accessibilityRole="button">
              <Text style={styles.deleteLinkText}>{t('Demander la suppression du compte')}</Text>
              <Ionicons name="arrow-forward" size={15} color="#b42318" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.loginButton, { borderColor: theme.backgroundSelected }]}
          onPress={goBack}
          accessibilityRole="button">
          <Text style={[styles.loginButtonText, { color: theme.text }]}>{t('Retour')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 18 },
  hero: { borderRadius: 22, padding: 20, gap: 11 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  heroIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#fff' },
  eyebrow: { color: '#ffffffd9', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 23, lineHeight: 29, fontWeight: '800' },
  subtitle: { color: '#ffffffeb', fontSize: 14, lineHeight: 20 },
  supportButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#fff', marginTop: 3 },
  supportButtonText: { fontSize: 14, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  faqList: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  faqItem: { borderBottomWidth: StyleSheet.hairlineWidth },
  question: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 9 },
  questionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  questionText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  answerWrap: { paddingLeft: 60, paddingRight: 16, paddingBottom: 15, gap: 9 },
  answer: { fontSize: 13, lineHeight: 19 },
  inlineLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 4 },
  inlineLinkText: { fontSize: 13, fontWeight: '700' },
  accountCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: 16 },
  accountIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  accountCopy: { flex: 1, gap: 4 },
  accountTitle: { fontSize: 14, fontWeight: '800' },
  accountDescription: { fontSize: 12, lineHeight: 18 },
  deleteLinkText: { color: '#b42318', fontSize: 13, fontWeight: '700' },
  loginButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  loginButtonText: { fontSize: 13, fontWeight: '700' },
});
