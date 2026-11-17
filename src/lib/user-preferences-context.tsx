import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentColor = 'blue' | 'orange' | 'green' | 'purple';
export type AppLanguage = 'fr' | 'en';

export type UserPreferences = {
  user_id: string;
  theme_mode: ThemeMode;
  accent_color: AccentColor;
  language: AppLanguage;
  notify_messages: boolean;
  notify_quotes: boolean;
  updated_at: string;
};

type PreferenceUpdate = Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>;
type PreferencesContextValue = {
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  updatePreferences: (update: PreferenceUpdate) => Promise<void>;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  user_id: '',
  theme_mode: 'system',
  accent_color: 'blue',
  language: 'fr',
  notify_messages: true,
  notify_quotes: true,
  updated_at: '',
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      try {
        await Promise.resolve();
        if (!active) return;
        setLoading(true);
        setError(null);
        if (!userId) {
          setPreferences(DEFAULT_PREFERENCES);
          return;
        }

        let { data, error: loadError } = await supabase
          .from('user_preferences')
          .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (loadError) throw loadError;
        if (!data) {
          const created = await supabase
            .from('user_preferences')
            .insert({ user_id: userId })
            .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
            .single();

          if (created.error?.code === '23505') {
            const retry = await supabase
              .from('user_preferences')
              .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
              .eq('user_id', userId)
              .single();
            if (retry.error) throw retry.error;
            data = retry.data;
          } else {
            if (created.error) throw created.error;
            data = created.data;
          }
        }

        if (!active) return;
        setPreferences(data as UserPreferences);
        channel = supabase
          .channel(`preferences-live-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'user_preferences',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              if (payload.eventType !== 'DELETE') setPreferences(payload.new as UserPreferences);
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('[preferences] Synchronisation en temps réel indisponible:', status);
            }
          });
      } catch (loadError) {
        if (!active) return;
        console.error('[preferences] Chargement impossible:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les préférences.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    Appearance.setColorScheme(preferences.theme_mode === 'system' ? 'unspecified' : preferences.theme_mode);
  }, [preferences.theme_mode]);

  const updatePreferences = useCallback(
    async (update: PreferenceUpdate) => {
      if (!userId) throw new Error('Connectez-vous pour modifier ces préférences.');
      const { data, error: updateError } = await supabase
        .from('user_preferences')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
        .single();

      if (updateError) {
        setError(updateError.message);
        throw updateError;
      }
      setPreferences(data as UserPreferences);
      setError(null);
    },
    [userId]
  );

  const value = useMemo(
    () => ({ preferences, loading, error, updatePreferences }),
    [preferences, loading, error, updatePreferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useUserPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useUserPreferences doit être utilisé dans <UserPreferencesProvider>');
  return value;
}

const ENGLISH_TEXT: Record<string, string> = {
  'Accueil': 'Home',
  'Tableau de bord': 'Dashboard',
  'Explorer': 'Explore',
  'Recherche': 'Search',
  'Connexion': 'Sign in',
  'Centre d’aide': 'Help center',
  'Comment pouvons-nous vous aider ?': 'How can we help?',
  'Retrouvez les réponses aux questions les plus fréquentes.': 'Find answers to common questions.',
  'NOUS SOMMES LÀ POUR VOUS': 'WE ARE HERE TO HELP',
  'Consultez les réponses ou écrivez directement à notre équipe.': 'Browse answers or write directly to our team.',
  'Écrire au support': 'Message support',
  'Ouverture…': 'Opening…',
  'Nom complet *': 'Full name *',
  'Nom obligatoire': 'Name required',
  'Saisissez votre nom complet.': 'Enter your full name.',
  'Votre nom': 'Your name',
  'Adresse e-mail *': 'Email address *',
  'Adresse e-mail pour la réponse': 'Email address for the reply',
  'Adresse e-mail invalide': 'Invalid email address',
  'Saisissez une adresse e-mail valide.': 'Enter a valid email address.',
  'Votre message *': 'Your message *',
  'Expliquez comment nous pouvons vous aider (10 caractères minimum)': 'Tell us how we can help (at least 10 characters)',
  'Message trop court': 'Message too short',
  'Votre message doit contenir au moins 10 caractères.': 'Your message must contain at least 10 characters.',
  'Envoyer au support': 'Send to support',
  'Votre message a été transmis au support. Nous vous répondrons par e-mail.': 'Your message has been sent to support. We will reply by email.',
  'Décrivez votre besoin. Vous pouvez nous contacter même sans vous connecter à votre compte.': 'Describe what you need. You can contact us without signing in to your account.',
  'Adresse e-mail du compte *': 'Account email address *',
  'Envoyer un code de vérification': 'Send a verification code',
  'Vérifier et envoyer la demande': 'Verify and send request',
  'Code de vérification *': 'Verification code *',
  'Code invalide': 'Invalid code',
  'Saisissez le code à 8 chiffres reçu par e-mail.': 'Enter the 8-digit code sent to your email.',
  'Vérifiez votre e-mail': 'Check your email',
  'Si cette adresse est associée à un compte, un code de vérification lui a été envoyé.': 'If this address is associated with an account, a verification code has been sent.',
  'Saisissez deux fois la même adresse e-mail.': 'Enter the same email address twice.',
  'La vérification de votre adresse e-mail a échoué.': 'Email verification failed.',
  'Renvoyer le code': 'Resend code',
  'La conversation du support est indisponible.': 'The support conversation is unavailable.',
  'Impossible de contacter le support. Réessayez.': 'Could not contact support. Please try again.',
  'Questions fréquentes': 'Frequently asked questions',
  'Touchez une question pour afficher la réponse.': 'Tap a question to see the answer.',
  'Créer ou modifier mon compte': 'Create or update my account',
  'Inscrivez-vous avec une adresse e-mail valide. Depuis Paramètres, vous pouvez modifier vos informations de profil.': 'Sign up with a valid email address. You can update your profile information in Settings.',
  'J’ai oublié mon mot de passe': 'I forgot my password',
  'Demandez un code de vérification par e-mail, puis saisissez-le dans l’application pour choisir un nouveau mot de passe.': 'Request an email verification code, then enter it in the app to choose a new password.',
  'La carte ne trouve pas ma position': 'The map cannot find my location',
  'Activez le GPS et autorisez Artisants à accéder à votre position pendant l’utilisation. Vous pouvez gérer le partage depuis les réglages de la carte.': 'Turn on GPS and allow Artisants to access your location while using the app. You can manage location sharing in the map settings.',
  'Comment suivre une demande de devis ?': 'How can I track a quote request?',
  'Ouvrez Mes devis pour consulter son statut, retrouver l’artisan attribué et discuter avec lui.': 'Open My Requests to check its status, find the assigned professional, and chat with them.',
  'Je ne reçois pas les notifications': 'I am not receiving notifications',
  'Vérifiez les autorisations de notifications du téléphone et les préférences dans Paramètres.': 'Check your phone notification permissions and your preferences in Settings.',
  'Qui peut voir ma position ?': 'Who can see my location?',
  'Le partage est facultatif. Pour un client, seule la personne attribuée à la demande peut voir la position partagée pour cette demande.': 'Sharing is optional. For a client, only the professional assigned to a request can see the location shared for that request.',
  'Gérer mon compte': 'Manage my account',
  'Vous pouvez envoyer une demande de suppression sécurisée avec les informations nécessaires.': 'You can submit a secure account deletion request with the required information.',
  'Demande de suppression': 'Deletion request',
  'Cette demande sera examinée par notre équipe. Votre compte ne sera pas supprimé automatiquement à l’envoi.': 'Our team will review this request. Your account will not be deleted automatically when it is submitted.',
  'Compte concerné': 'Account',
  'Motif de la demande *': 'Reason for request *',
  'Je n’utilise plus l’application': 'I no longer use the app',
  'J’ai un autre compte': 'I have another account',
  'Confidentialité et données personnelles': 'Privacy and personal data',
  'Autre raison': 'Other reason',
  'Précisions *': 'Details *',
  'Expliquez votre demande (20 caractères minimum)': 'Explain your request (at least 20 characters)',
  'Confirmez votre adresse e-mail *': 'Confirm your email address *',
  'Adresse e-mail du compte': 'Account email address',
  'Je confirme vouloir demander la suppression de mon compte et comprends que cette action sera traitée par l’équipe.': 'I confirm that I want to request deletion of my account and understand that the team will process this request.',
  'Envoyer ma demande': 'Submit my request',
  'Envoi…': 'Submitting…',
  'Motif obligatoire': 'Reason required',
  'Choisissez le motif de votre demande.': 'Choose a reason for your request.',
  'Précisions obligatoires': 'Details required',
  'Décrivez votre demande en au moins 20 caractères.': 'Describe your request in at least 20 characters.',
  'Adresse e-mail incorrecte': 'Email address does not match',
  'Saisissez exactement l’adresse e-mail de votre compte.': 'Enter the exact email address associated with your account.',
  'Confirmation obligatoire': 'Confirmation required',
  'Confirmez que vous souhaitez demander la suppression de votre compte.': 'Confirm that you want to request account deletion.',
  'Votre demande a été transmise au support. Votre compte reste actif jusqu’à son traitement.': 'Your request has been sent to support. Your account remains active until it is processed.',
  'Connexion et compte': 'Signing in and your account',
  'Utilisez l’adresse e-mail et le mot de passe associés à votre compte Artisants.': 'Use the email address and password associated with your Artisants account.',
  'Demandez un code de vérification par e-mail pour réinitialiser votre mot de passe.': 'Request an email verification code to reset your password.',
  'Réinitialiser mon mot de passe': 'Reset my password',
  'Trouver un artisan': 'Find a professional',
  'Connectez-vous comme client, autorisez la localisation et consultez la carte des professionnels proches.': 'Sign in as a client, allow location access, and view nearby professionals on the map.',
  'Choisissez un artisan sur la carte puis envoyez votre demande de devis depuis sa fiche.': 'Choose a professional on the map, then send a quote request from their profile.',
  'Contacter le support': 'Contact support',
  'Une fois connecté, ouvrez Messages et démarrez une conversation avec Artisant.': 'Once signed in, open Messages and start a conversation with Artisant.',
  'Retour à la connexion': 'Back to sign in',
  'Retour': 'Back',
  'Mes devis': 'My requests',
  'Messages': 'Messages',
  'Profil': 'Profile',
  'Paramètres': 'Settings',
  'Notifications': 'Notifications',
  'Alertes': 'Alerts',
  'Mot de passe oublié': 'Forgot password',
  'Nouveau mot de passe': 'New password',
  'Compte': 'Account',
  'Paramètres du compte': 'Account settings',
  'Personnalisez votre expérience': 'Customize your experience',
  'Gérez votre profil, votre apparence et vos notifications': 'Manage your profile, appearance, and notifications',
  'Informations du profil': 'Profile information',
  'Modifier la photo de profil': 'Change profile photo',
  'Touchez l’icône pour changer votre photo': 'Tap the icon to change your photo',
  'Accès aux photos refusé': 'Photo access denied',
  'Autorisez l’accès aux photos pour choisir une image de profil.': 'Allow photo access to choose a profile image.',
  'Aucune photo sélectionnée.': 'No photo selected.',
  'La photo doit peser moins de 5 Mo.': 'The photo must be smaller than 5 MB.',
  'Photo mise à jour': 'Photo updated',
  'Votre photo de profil est visible immédiatement.': 'Your profile photo is now visible.',
  'Mise à jour de la photo impossible': 'Could not update photo',
  'Nom complet': 'Full name',
  'Téléphone': 'Phone',
  'Ville': 'City',
  'Profession': 'Profession',
  'Description de vos services': 'Describe your services',
  'Enregistrer': 'Save',
  'Envoyer': 'Send',
  'Disponibilité': 'Availability',
  'Votre profil apparaît dans la recherche.': 'Your profile appears in search results.',
  'Votre profil est masqué de la recherche.': 'Your profile is hidden from search results.',
  'Informations légales': 'Legal information',
  'Politique de confidentialité': 'Privacy policy',
  'Conditions d’utilisation': 'Terms of use',
  'Zone de confidentialité': 'Privacy',
  'Préférences indisponibles': 'Preferences unavailable',
  'Enregistrement impossible': 'Could not save',
  'Veuillez réessayer.': 'Please try again.',
  'Vous pouvez transmettre une demande de suppression de votre compte à notre équipe.': 'You can submit an account deletion request to our team.',
  'Demander la suppression du compte': 'Request account deletion',
  'Notifications en temps réel': 'Real-time notifications',
  'Être averti des nouveaux messages': 'Notify me about new messages',
  'Être averti de mes demandes de devis': 'Notify me about quote requests',
  'Apparence': 'Appearance',
  'Thème': 'Theme',
  'Suivre l’appareil': 'Use device setting',
  'Clair': 'Light',
  'Sombre': 'Dark',
  'Couleur': 'Accent color',
  'Langue': 'Language',
  'Français': 'French',
  'Anglais': 'English',
  'Bleu': 'Blue',
  'Orange': 'Orange',
  'Vert': 'Green',
  'Violet': 'Purple',
  'Aucune notification pour le moment.': 'No notifications yet.',
  'Notifications système': 'System notifications',
  'Activées sur cet appareil': 'Enabled on this device',
  'Désactivées sur cet appareil': 'Disabled on this device',
  'Notifications push indisponibles': 'Push notifications unavailable',
  'Activées': 'Enabled',
  'Autoriser': 'Allow',
  'Tout marquer comme lu': 'Mark all as read',
  'Nouvelle demande attribuée': 'New request assigned',
  'Artisan trouvé': 'Professional assigned',
  'Professional assigned': 'Professional assigned',
  'New request assigned': 'New request assigned',
  'Mise à jour de votre demande': 'Your request was updated',
  'Nouveau message du support': 'New support message',
  'Nouveau message': 'New message',
  'Artisans proches': 'Nearby professionals',
  'Rechercher un artisan': 'Search professionals',
  'Effacer la recherche': 'Clear search',
  'Catégories': 'Categories',
  'Toutes les catégories': 'All categories',
  'Choisir une catégorie': 'Choose a category',
  'Fermer': 'Close',
  'Aucun résultat pour cette recherche.': 'No results for this search.',
  'Nouvel artisan': 'New professional',
  'Disponible': 'Available',
  'Artisans disponibles': 'Available professionals',
  'Des professionnels autour de vous': 'Professionals near you',
  'La carte sera affichée après la localisation.': 'The map will appear after location access is granted.',
  'Tous les métiers': 'All trades',
  'Recherche en cours…': 'Searching…',
  'résultat': 'result',
  'résultats': 'results',
  'Aucun artisan disponible à proximité.': 'No professionals available nearby.',
  'Demander un devis': 'Request a quote',
  'En examen par l’administration': 'Under review',
  'Approuvée': 'Approved',
  'Rejetée': 'Rejected',
  'Sélection du justificatif impossible': 'Could not select document',
  'Réessayez avec un autre fichier.': 'Try another file.',
  'Champ obligatoire': 'Required field',
  'Remplissez tous les champs du formulaire.': 'Complete all form fields.',
  'E-mail invalide': 'Invalid email',
  'Saisissez une adresse e-mail de contact valide.': 'Enter a valid contact email address.',
  'Justificatifs manquants': 'Missing documents',
  'Sélectionnez les quatre justificatifs obligatoires.': 'Select all four required documents.',
  'Votre dossier complet a été transmis pour examen.': 'Your complete application has been submitted for review.',
  'Vérifiez votre connexion puis réessayez.': 'Check your connection and try again.',
  'Vérification entreprise': 'Business verification',
  'Entreprise': 'Business',
  'Sous-traitance': 'Subcontractor',
  'Message de l’administration': 'Administrator message',
  'Une seule demande est autorisée par compte. Vous pouvez revenir ici pour suivre son statut.': 'Only one request is allowed per account. Return here to check its status.',
  'Envoyez une demande pour faire vérifier votre activité. Tous les renseignements et justificatifs sont obligatoires.': 'Submit a request to verify your business. All details and supporting documents are required.',
  'Statut demandé *': 'Requested status *',
  'Preuve de création ou immatriculation': 'Proof of incorporation or registration',
  'Preuve fiscale': 'Tax document',
  'Pièce d’identité du représentant': 'Representative identity document',
  'Mandat ou justificatif complémentaire': 'Authorization or additional supporting document',
  'Nom légal de l’entreprise': 'Legal business name',
  'Pays d’activité': 'Country of operation',
  'Numéro d’immatriculation': 'Registration number',
  'Numéro fiscal': 'Tax number',
  'Adresse professionnelle': 'Business address',
  'Nom du représentant': 'Representative name',
  'E-mail de contact': 'Contact email',
  'Téléphone de contact': 'Contact phone',
  'Justificatifs obligatoires *': 'Required documents *',
  'Les pièces doivent établir l’existence et l’activité de l’entreprise. Les exigences légales dépendent du pays indiqué. PDF, JPEG, PNG ou WebP, 15 Mo maximum par fichier.': 'Documents must show that the business exists and operates. Legal requirements depend on the selected country. PDF, JPEG, PNG or WebP, max 15 MB each.',
  'Touchez pour sélectionner un fichier': 'Tap to select a file',
  'Envoi sécurisé…': 'Secure upload…',
  'Les justificatifs sont stockés dans un espace privé et accessibles uniquement à vous et aux administrateurs chargés de l’examen.': 'Documents are stored privately and accessible only to you and the administrators reviewing your request.',
  'Entreprise vérifiée': 'Verified business',
  'Sous-traitance vérifiée': 'Verified subcontractor',
  'Demander un statut entreprise': 'Request business status',
  'Suivre ou envoyer une demande de vérification': 'Track or submit a verification request',
  'Statut entreprise': 'Business status',
  'Professionnel': 'Professional',
  'Artisan': 'Craftsperson',
  'Bonjour': 'Hello',
  'Réessayer': 'Try again',
  'Compte artisan': 'Craftsperson account',
  'Compte client': 'Client account',
  'Mon compte': 'My account',
  'Client': 'Client',
  'Voulez-vous vraiment fermer votre session ?': 'Are you sure you want to sign out?',
  'Annuler': 'Cancel',
  'Déconnexion impossible': 'Could not sign out',
  'Réessayez plus tard.': 'Please try again later.',
  'Non renseigné': 'Not provided',
  'Aucun message. Écrivez le premier !': 'No messages yet. Send the first one!',
  'Votre message': 'Your message',
  'Discussion': 'Conversation',
  'Aucune discussion.': 'No conversations.',
  'Contacter l’équipe support': 'Contact support',
  'Nouvelles demandes': 'New requests',
  'En cours': 'In progress',
  'Terminées': 'Completed',
  'Revenus': 'Revenue',
  'Aucune nouvelle demande.': 'No new requests.',
  'Travaux en cours': 'Work in progress',
  'Aucun travail en cours.': 'No work in progress.',
  'Demandes assignées par l’Admin': 'Requests assigned by admin',
  'Activité des 7 derniers jours': 'Activity over the last 7 days',
  'Nombre de demandes reçues': 'Requests received',
  'Répartition des demandes': 'Request breakdown',
  'Refusées': 'Declined',
  'En direct': 'Live',
  'Hors ligne': 'Offline',
  'Accepter': 'Accept',
  'Refuser': 'Decline',
  'Chat': 'Chat',
  'Marquer terminé': 'Mark complete',
  'Non renseignée': 'Not provided',
  'ESPACE ARTISAN': 'CRAFTSPERSON AREA',
  'Espace artisan': 'Craftsperson area',
  'Demandes reçues': 'Received requests',
  'Visible par les clients proches': 'Visible to nearby clients',
  'Partager ma position sur la carte': 'Share my location on the map',
  'Visible en temps réel aux clients et artisans proches. Désactivez à tout moment.': 'Visible in real time to nearby clients and professionals. Turn it off at any time.',
  'Carte en temps réel': 'Live map',
  'artisan visible': 'visible professional',
  'artisans visibles': 'visible professionals',
  'demande partagée': 'shared request',
  'demandes partagées': 'shared requests',
  'Aucun artisan ou client avec position partagée à proximité.': 'No nearby professionals or clients sharing their location.',
  'Erreur': 'Error',
  'Impossible de modifier la visibilité de votre position.': 'Could not change your location visibility.',
  'Masqué des recherches': 'Hidden from search',
  'Accueil et carte': 'Home and map',
  'Ouvrir le menu': 'Open menu',
  'Fermer le menu': 'Close menu',
  'Catégorie requise': 'Category required',
  'Choisissez le type de service.': 'Choose a service type.',
  'Description trop courte': 'Description is too short',
  'Décrivez votre besoin (10 caractères minimum).': 'Describe your request (at least 10 characters).',
  'Budget invalide': 'Invalid budget',
  'Entrez un montant valide ou laissez vide.': 'Enter a valid amount or leave it blank.',
  'Demande envoyée': 'Request sent',
  'Elle est en attente : l’équipe va l’attribuer à l’artisan le plus adapté.': 'Your request is pending assignment to a suitable professional.',
  'Chat indisponible': 'Chat unavailable',
  'Toutes': 'All',
  'En attente': 'Pending',
  'Attribuées': 'Assigned',
  'Catégorie *': 'Category *',
  'Titre': 'Title',
  'Ex : Fuite sous l’évier': 'E.g. leaking sink',
  'Description *': 'Description *',
  'Décrivez précisément votre besoin': 'Describe what you need in detail',
  'Urgence': 'Urgency',
  'Flexible': 'Flexible',
  'Normale': 'Normal',
  'Urgente': 'Urgent',
  'Adresse d’intervention': 'Service address',
  'Quartier, rue, ville': 'Neighborhood, street, city',
  'Budget estimé (optionnel)': 'Estimated budget (optional)',
  'Partager ma position avec l’artisan attribué': 'Share my location with the assigned professional',
  'Facultatif : elle sera visible uniquement par l’artisan attribué pendant cette demande.': 'Optional: it will only be visible to the professional assigned to this request.',
  'Position indisponible': 'Location unavailable',
  'Autorisez la localisation pour partager votre position avec l’artisan attribué.': 'Allow location access to share your location with the assigned professional.',
  'Arrêter le partage de position': 'Stop sharing my location',
  'Partager ma position pour cette demande': 'Share my location for this request',
  'Modification impossible': 'Could not update',
  'Montant': 'Amount',
  'Envoyer la demande': 'Send request',
  'Discuter avec Artisant (support)': 'Chat with Artisant support',
  'Mes demandes': 'My requests',
  'Aucune demande dans cette liste.': 'No requests in this list.',
  'En attente d’un artisan': 'Waiting for a professional',
  'Attribuée': 'Assigned',
  'Attribuée · en attente de réponse': 'Assigned · awaiting response',
  'Acceptée': 'Accepted',
  'Refusée': 'Declined',
  'Terminée': 'Completed',
  'Demande de devis': 'Quote request',
  'Urgent': 'Urgent',
  'Budget': 'Budget',
  'Aucun artisan attribué pour le moment.': 'No professional assigned yet.',
  'Sans description': 'No description',
  'Prix': 'Price',
  'Se déconnecter': 'Sign out',
  'Note': 'Rating',
  'Profil enregistré': 'Profile saved',
  'Vos informations ont été mises à jour.': 'Your information has been updated.',
  'Nom requis': 'Name required',
  'Veuillez saisir votre nom complet.': 'Please enter your full name.',
  'Mise à jour impossible': 'Could not update',
  'Demande déjà reçue': 'Request already received',
  'Une demande de suppression de votre compte est déjà en cours de traitement.': 'An account deletion request is already being processed.',
  'Votre demande de suppression a été transmise à notre équipe. Votre compte reste actif jusqu’à son traitement.': 'Your deletion request has been sent to our team. Your account remains active until it is processed.',
  'Votre demande sera transmise à notre équipe. Le compte ne sera pas supprimé immédiatement.': 'Your request will be sent to our team. Your account will not be deleted immediately.',
  'Envoi impossible': 'Could not send',
  'Aucun message': 'No messages',
  'Ouvrir mon tableau de bord': 'Open my dashboard',
};

export function useTranslate() {
  const { preferences } = useUserPreferences();
  return useCallback(
    (text: string) => preferences.language === 'en' ? (ENGLISH_TEXT[text] ?? text) : text,
    [preferences.language]
  );
}
